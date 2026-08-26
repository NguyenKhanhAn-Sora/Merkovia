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
import { Types } from 'mongoose';
import { VouchersService } from './vouchers.service';
import { CreateVoucherDto, ListVouchersDto, PreviewVoucherDto } from './dto/voucher.dto';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';

/** Mã giảm giá của gian hàng — chỉ người bán quản lý. */
@Controller('shop-vouchers')
@UseGuards(JwtAuthGuard)
export class ShopVouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  @Get()
  list(@CurrentUser() user: UserDocument, @Query() query: ListVouchersDto) {
    return this.vouchers.list(user, query);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@CurrentUser() user: UserDocument, @Body() dto: CreateVoucherDto) {
    return this.vouchers.create(user, dto);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  end(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.vouchers.end(user, id);
  }
}

/** Tra cứu/áp mã của người mua. */
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  /** Công khai — hiện ở trang gian hàng và ô "Chọn mã giảm giá" lúc thanh toán. */
  @Get('shop/:shopId')
  forShop(@Param('shopId') shopId: string) {
    return this.vouchers.publicListForShop(shopId);
  }

  /**
   * Xem trước mức giảm TRƯỚC khi đặt hàng — không ghi gì, dùng đúng hàm
   * `resolveForCheckout` mà `OrdersService.buildGroups` gọi lúc đặt thật, nên
   * số hiện ra ở đây luôn khớp số bị trừ.
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async preview(
    @CurrentUser() user: UserDocument,
    @Body() dto: PreviewVoucherDto,
  ) {
    const resolved = await this.vouchers.resolveForCheckout(
      new Types.ObjectId(dto.shopId),
      user._id,
      dto.code,
      dto.itemsTotal,
    );
    return { code: resolved.code, discount: resolved.discount };
  }
}
