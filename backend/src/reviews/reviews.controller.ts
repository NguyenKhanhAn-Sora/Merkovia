import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReviewsService } from './reviews.service';
import {
  CreateReviewDto,
  ListReviewsDto,
  ListShopReviewsDto,
  ReplyReviewDto,
  UpdateReviewDto,
} from './dto/review.dto';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';

/** Đánh giá công khai của một sản phẩm — ai cũng đọc được, không cần đăng nhập. */
@Controller('products/:productId/reviews')
export class ProductReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Param('productId') productId: string, @Query() query: ListReviewsDto) {
    return this.reviews.listForProduct(productId, query);
  }
}

@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Viết đánh giá. Giới hạn chặt: mỗi đánh giá là một bản ghi vĩnh viễn. */
  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@CurrentUser() user: UserDocument, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user, dto);
  }

  /** Sửa đánh giá đã đăng — chỉ một lần, trong hạn (xem `ReviewsService.update`). */
  @Patch(':id')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  update(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviews.update(user, id, dto);
  }

  /**
   * Dòng hàng đã đánh giá của NHIỀU đơn cùng lúc.
   *
   * Đặt TRƯỚC `mine/:orderId` kẻo bị route đó nuốt. Trang danh sách đơn cần
   * biết đơn nào còn món chưa đánh giá — hỏi từng đơn là mỗi lần mở trang lại
   * thêm chục request.
   */
  @Get('mine')
  mineBatch(
    @CurrentUser() user: UserDocument,
    @Query('orderIds') orderIds?: string,
  ) {
    return this.reviews.myReviewsForOrders(
      user,
      (orderIds ?? '').split(',').filter(Boolean),
    );
  }

  /** Những dòng hàng trong đơn mà mình đã đánh giá. */
  @Get('mine/:orderId')
  mine(@CurrentUser() user: UserDocument, @Param('orderId') orderId: string) {
    return this.reviews.myReviewsForOrder(user, orderId);
  }
}

/** Trang Đánh giá của Kênh Người Bán. */
@Controller('shop-reviews')
@UseGuards(JwtAuthGuard)
export class ShopReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@CurrentUser() user: UserDocument, @Query() query: ListShopReviewsDto) {
    return this.reviews.listForShop(user, query);
  }

  @Post(':id/reply')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  reply(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: ReplyReviewDto,
  ) {
    return this.reviews.reply(user, id, dto);
  }
}
