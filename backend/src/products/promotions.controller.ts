import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PromotionsService } from './promotions.service';
import { ListDealsDto, SetDealDto } from './dto/promotion.dto';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';

/** Khuyến mãi của gian hàng — chỉ người bán dùng. */
@Controller('shop-promotions')
@UseGuards(JwtAuthGuard)
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  list(@CurrentUser() user: UserDocument, @Query() query: ListDealsDto) {
    return this.promotions.list(user, query);
  }

  /** Sản phẩm đang bán mà chưa có khuyến mãi. */
  @Get('selectable')
  selectable(@CurrentUser() user: UserDocument) {
    return this.promotions.selectable(user);
  }

  /** `PUT` vì đặt lại nhiều lần cho cùng một sản phẩm phải ra cùng kết quả. */
  @Put(':productId')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  set(
    @CurrentUser() user: UserDocument,
    @Param('productId') productId: string,
    @Body() dto: SetDealDto,
  ) {
    return this.promotions.setDeal(user, productId, dto);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  end(
    @CurrentUser() user: UserDocument,
    @Param('productId') productId: string,
  ) {
    return this.promotions.endDeal(user, productId);
  }
}
