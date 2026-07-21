import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PaymentService } from './payment.service';
import {
  MockPaymentGatewayProvider,
  PaymentGatewayProvider,
  signPayload,
} from './gateway/payment-gateway.provider';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';

/**
 * Webhook của cổng thanh toán — CÔNG KHAI, không có JwtAuthGuard.
 *
 * Cổng gọi từ server của họ nên không có cookie phiên. Cái thay thế cho đăng
 * nhập ở đây là **chữ ký HMAC trên thân request thô**; đó mới là ranh giới
 * bảo mật, và nó được kiểm ngay dòng đầu tiên trong service.
 */
@Controller('payments')
export class PaymentWebhookController {
  constructor(private readonly payments: PaymentService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  // Nới hơn các route khác: cổng có thể gửi lại nhiều lần khi mạng chập chờn,
  // chặn nhầm sẽ làm mất sự kiện thanh toán thật.
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    // Chữ ký ký trên đúng chuỗi byte cổng gửi đi — JSON.stringify lại có thể
    // đổi thứ tự khoá và làm chữ ký sai oan.
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});
    return this.payments.handleWebhook(raw, headers);
  }
}

/** Phiên thanh toán của chính người mua. */
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Get('needing-refund')
  needingRefund() {
    return this.payments.listNeedingRefund();
  }

  @Get(':code')
  mine(@CurrentUser() user: UserDocument, @Param('code') code: string) {
    return this.payments.getMine(user, code);
  }
}

/**
 * Trang trả tiền GIẢ LẬP — thay cho website của cổng thật.
 *
 * Tồn tại để chạy được toàn bộ luồng khi chưa có hợp đồng với nhà cung cấp.
 * Bấm nút ở đây sẽ tạo webhook **có chữ ký thật** rồi đi qua đúng đường xử lý
 * như cổng thật gọi vào, nên phần code quan trọng nhất không bị bỏ sót khi test.
 */
@Controller('payments/mock')
export class MockGatewayController {
  constructor(
    private readonly payments: PaymentService,
    private readonly gateway: PaymentGatewayProvider,
  ) {}

  private get mock(): MockPaymentGatewayProvider {
    if (!(this.gateway instanceof MockPaymentGatewayProvider)) {
      throw new Error('Trang thanh toán giả lập chỉ dùng với cổng giả lập.');
    }
    return this.gateway;
  }

  /** Thông tin phiên để trang giả lập hiển thị số tiền. */
  @Get(':code')
  session(@Param('code') code: string) {
    const session = this.mock.getSession(code);
    return {
      found: !!session,
      amount: session?.amount ?? 0,
      status: session?.status ?? 'failed',
      expiresAt: session?.expiresAt,
    };
  }

  /** Người mua bấm "Thanh toán" hoặc "Huỷ" trên trang giả lập. */
  @Post(':code/complete')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async complete(
    @Param('code') code: string,
    @Body() body: { result?: string; amount?: number; silent?: boolean },
  ) {
    const result = body.result === 'failed' ? 'failed' : 'paid';
    const session = this.mock.markSession(code, result);
    if (!session) return { ok: false, reason: 'not_found' };

    // `silent` = giả lập webhook bị thất lạc: cổng đã ghi nhận trả tiền nhưng
    // Merkovia không nhận được thông báo. Dùng để kiểm chứng đường đối soát —
    // thứ duy nhất cứu được đơn khách đã trả tiền mà hệ thống không biết.
    if (body.silent) return { ok: true, delivered: false };

    const payload = JSON.stringify({
      eventId: `${code}-${result}-${Date.now()}`,
      code,
      status: result,
      // Cho phép ép số tiền lệch để thử nhánh thu thiếu.
      amount: body.amount ?? session.amount,
      providerRef: `MOCK-${code}`,
    });

    return this.payments.handleWebhook(payload, {
      'x-merkovia-signature': signPayload(payload),
    });
  }
}
