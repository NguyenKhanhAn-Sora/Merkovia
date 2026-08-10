import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PayoutService } from './payout.service';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard, CurrentAdmin } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import { QueryAdminPayoutsDto, ResolvePayoutDto } from './dto/admin-payout.dto';
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

/** Đối soát & rút tiền — admin xem toàn bộ đợt chi trả của sàn và gỡ kẹt các đợt đang `processing`. */
@Controller('admin/payouts')
@UseGuards(AdminAuthGuard)
export class AdminPayoutController {
  constructor(private readonly payouts: PayoutService) {}

  @Get()
  list(@Query() query: QueryAdminPayoutsDto) {
    return this.payouts.adminList(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.payouts.adminGetOne(id);
  }

  /** Tra lại trạng thái thật từ nhà cung cấp — ưu tiên dùng trước khi chốt thủ công. */
  @Post(':id/check-status')
  @HttpCode(HttpStatus.OK)
  checkStatus(@CurrentAdmin() admin: AdminPrincipal, @Param('id') id: string) {
    return this.payouts.adminCheckStatus(admin, id);
  }

  /** Chốt thủ công khi không tra cứu được nhà cung cấp — bắt buộc ghi lý do. */
  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: ResolvePayoutDto,
  ) {
    return this.payouts.adminForceResolve(admin, id, dto.action, dto.note);
  }
}
