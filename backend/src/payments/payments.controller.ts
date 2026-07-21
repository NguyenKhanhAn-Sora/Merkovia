import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { LookupBankAccountDto } from './dto/bank-account.dto';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';

/** Tài khoản nhận tiền của gian hàng — chỉ chủ shop thao tác được. */
@Controller('bank-account')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Danh sách ngân hàng cho ô chọn. */
  @Get('banks')
  banks() {
    return this.payments.banks();
  }

  @Get()
  mine(@CurrentUser() user: UserDocument) {
    return this.payments.myBankAccount(user);
  }

  /**
   * Tra cứu tên chủ tài khoản, chưa lưu gì.
   * Siết chặt hơn các route khác: mỗi lần gọi là một lần hỏi ra ngoài (tốn phí
   * với nhà cung cấp thật) và có thể bị lạm dụng để dò số tài khoản.
   */
  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  lookup(
    @CurrentUser() user: UserDocument,
    @Body() dto: LookupBankAccountDto,
  ) {
    return this.payments.lookup(user, dto);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  link(@CurrentUser() user: UserDocument, @Body() dto: LookupBankAccountDto) {
    return this.payments.linkBankAccount(user, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: UserDocument) {
    return this.payments.removeBankAccount(user);
  }
}
