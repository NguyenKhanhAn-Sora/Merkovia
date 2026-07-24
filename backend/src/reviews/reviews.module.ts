import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Review, ReviewSchema } from './schemas/review.schema';
import { ReviewsService } from './reviews.service';
import {
  ProductReviewsController,
  ReviewsController,
  ShopReviewsController,
} from './reviews.controller';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { ShopsModule } from '../shops/shops.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Đánh giá sản phẩm sau khi mua.
 *
 * Tách thành module riêng chứ không nhét vào `products`: đánh giá đụng tới đơn
 * hàng, hồ sơ người mua và gian hàng, và sẽ còn phình thêm (báo xấu, lọc nội
 * dung, huy hiệu "đã mua hàng").
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Review.name, schema: ReviewSchema }]),
    OrdersModule, // model Order: kiểm đơn đã giao chưa
    ProductsModule, // model Product: cập nhật điểm sao
    ProfilesModule, // tên + ảnh người viết
    ShopsModule, // gian hàng của người bán
    AuthModule, // JwtAuthGuard
    NotificationsModule, // báo đánh giá mới cho người bán
  ],
  controllers: [
    ProductReviewsController,
    ReviewsController,
    ShopReviewsController,
  ],
  providers: [ReviewsService],
  exports: [ReviewsService, MongooseModule],
})
export class ReviewsModule {}
