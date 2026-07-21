import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PayoutService } from './payout.service';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';

class ListPayoutsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** Doanh thu & rút tiền của gian hàng. */
@Controller('payouts')
@UseGuards(JwtAuthGuard)
export class PayoutController {
  constructor(private readonly payouts: PayoutService) {}

  @Get('balance')
  balance(@CurrentUser() user: UserDocument) {
    return this.payouts.balance(user);
  }

  @Get()
  list(@CurrentUser() user: UserDocument, @Query() query: ListPayoutsDto) {
    return this.payouts.listMine(user, query.page, query.limit);
  }

  /** Yêu cầu rút tiền — siết chặt vì đây là route chuyển tiền ra ngoài. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  request(@CurrentUser() user: UserDocument) {
    return this.payouts.requestPayout(user);
  }
}
