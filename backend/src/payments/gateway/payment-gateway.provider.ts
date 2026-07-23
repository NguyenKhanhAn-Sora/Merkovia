import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../config/config';

/** Trạng thái chuẩn hoá, độc lập với cách gọi tên của từng cổng. */
export type GatewayPaymentStatus = 'pending' | 'paid' | 'failed' | 'expired';

export interface CreatePaymentInput {
  /** Mã phiên phía Merkovia — cổng sẽ trả lại trong webhook. */
  code: string;
  amount: number;
  description: string;
  expiresAt: Date;
  /** Nơi cổng đưa người mua về sau khi trả xong. */
  returnUrl: string;
  cancelUrl: string;
}

export interface CreatePaymentResult {
  providerRef: string;
  /** Link người mua bấm vào để trả tiền. */
  checkoutUrl: string;
}

/** Sự kiện đã được xác thực chữ ký, chuẩn hoá về một dạng chung. */
export interface GatewayWebhookEvent {
  /** Id sự kiện phía cổng — dùng để chống xử lý trùng. */
  eventId: string;
  /** Mã phiên phía Merkovia. */
  code: string;
  status: GatewayPaymentStatus;
  /** Số tiền cổng báo đã thu. */
  amount: number;
  providerRef?: string;
}

export interface WebhookVerifyResult {
  valid: boolean;
  event?: GatewayWebhookEvent;
  reason?: string;
}

/**
 * Cổng thanh toán.
 *
 * Tách trừu tượng để đổi nhà cung cấp (payOS / VNPay / MoMo / ZaloPay…) mà
 * không đụng nghiệp vụ đơn hàng. Ba việc bắt buộc mọi cổng đều phải làm được:
 * tạo phiên, xác thực webhook, và **hỏi ngược trạng thái** — cái thứ ba là thứ
 * cứu bạn khi webhook bị mất, đừng chọn cổng nào không có nó.
 */
export abstract class PaymentGatewayProvider {
  abstract readonly name: string;
  /** `false` = giả lập, giao diện phải nói rõ đây không phải tiền thật. */
  abstract readonly isReal: boolean;

  abstract createPayment(
    input: CreatePaymentInput,
  ): Promise<CreatePaymentResult>;

  /**
   * Xác thực chữ ký webhook.
   * Nhận **thân request thô** chứ không phải object đã parse: chữ ký ký trên
   * đúng chuỗi byte cổng gửi đi, JSON.stringify lại có thể đổi thứ tự khoá và
   * làm chữ ký sai.
   */
  abstract verifyWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookVerifyResult;

  /** Hỏi ngược trạng thái — dùng cho đối soát khi webhook thất lạc. */
  abstract getStatus(providerRef: string): Promise<GatewayPaymentStatus>;
}

/* ------------------------------------------------------------------ *
 *  Bản giả lập
 * ------------------------------------------------------------------ */

/** Bộ nhớ phiên của cổng giả lập (thật thì nằm bên phía nhà cung cấp). */
interface MockSession {
  code: string;
  amount: number;
  status: GatewayPaymentStatus;
  expiresAt: Date;
}

/**
 * Cổng thanh toán giả lập — KHÔNG gọi ra ngoài.
 *
 * Ký webhook bằng HMAC-SHA256 thật với `config.paymentWebhookSecret`, nên toàn
 * bộ đường xác thực chữ ký ở phía nhận là code thật đang chạy thật, không phải
 * nhánh bị bỏ qua. Đổi sang cổng thật thì phần đó đã được kiểm chứng sẵn.
 */
@Injectable()
export class MockPaymentGatewayProvider extends PaymentGatewayProvider {
  readonly name = 'Cổng giả lập (môi trường phát triển)';
  readonly isReal = false;

  private readonly logger = new Logger(MockPaymentGatewayProvider.name);
  private readonly sessions = new Map<string, MockSession>();

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerRef = `MOCK-${input.code}`;
    this.sessions.set(input.code, {
      code: input.code,
      amount: input.amount,
      status: 'pending',
      expiresAt: input.expiresAt,
    });

    this.logger.warn(
      `Tạo phiên thanh toán GIẢ LẬP ${input.code} — ${input.amount}đ.`,
    );

    // Trang trả tiền giả nằm ngay trên app người mua, không phải cổng thật.
    const checkoutUrl = `${config.frontendUrl}/payment/${encodeURIComponent(input.code)}`;
    return Promise.resolve({ providerRef, checkoutUrl });
  }

  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookVerifyResult {
    const raw = headers['x-merkovia-signature'];
    const signature = Array.isArray(raw) ? raw[0] : raw;
    if (!signature) {
      return { valid: false, reason: 'Thiếu chữ ký webhook.' };
    }

    const expected = signPayload(rawBody);
    // So sánh theo thời gian hằng định để không lộ chữ ký qua đo thời gian.
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, reason: 'Chữ ký webhook không hợp lệ.' };
    }

    let parsed: Partial<GatewayWebhookEvent>;
    try {
      parsed = JSON.parse(rawBody) as Partial<GatewayWebhookEvent>;
    } catch {
      return {
        valid: false,
        reason: 'Payload webhook không phải JSON hợp lệ.',
      };
    }

    if (!parsed.code || !parsed.status || typeof parsed.amount !== 'number') {
      return { valid: false, reason: 'Payload webhook thiếu trường bắt buộc.' };
    }

    return {
      valid: true,
      event: {
        eventId: parsed.eventId ?? `${parsed.code}-${parsed.status}`,
        code: parsed.code,
        status: parsed.status,
        amount: parsed.amount,
        providerRef: parsed.providerRef,
      },
    };
  }

  getStatus(providerRef: string): Promise<GatewayPaymentStatus> {
    const code = providerRef.replace(/^MOCK-/, '');
    const session = this.sessions.get(code);
    if (!session) return Promise.resolve('failed');
    if (
      session.status === 'pending' &&
      session.expiresAt.getTime() < Date.now()
    ) {
      return Promise.resolve('expired');
    }
    return Promise.resolve(session.status);
  }

  /* --------------- Chỉ dùng cho trang trả tiền giả lập --------------- */

  /** Người mua bấm "Thanh toán"/"Huỷ" trên trang giả → cập nhật phiên. */
  markSession(code: string, status: GatewayPaymentStatus): MockSession | null {
    const session = this.sessions.get(code);
    if (!session) return null;
    session.status = status;
    return session;
  }

  getSession(code: string): MockSession | null {
    return this.sessions.get(code) ?? null;
  }
}

/** Ký payload đúng cách cổng giả lập ký — dùng chung cho cả bên gửi webhook. */
export function signPayload(rawBody: string): string {
  return createHmac('sha256', config.paymentWebhookSecret)
    .update(rawBody)
    .digest('hex');
}
