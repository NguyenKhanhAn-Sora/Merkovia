import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Review, ReviewSchema } from './schemas/review.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ReviewsService } from './reviews.service';
import {
  AdminReviewsController,
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
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';

/**
 * Đánh giá sản phẩm sau khi mua.
 *
 * Tách thành module riêng chứ không nhét vào `products`: đánh giá đụng tới đơn
 * hàng, hồ sơ người mua và gian hàng, và sẽ còn phình thêm (báo xấu, lọc nội
 * dung, huy hiệu "đã mua hàng").
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      // Đăng ký trực tiếp model User (không import UsersModule) để tránh kéo
      // theo phụ thuộc ngoài ý muốn — giống cách CategoriesModule tự đăng ký
      // Product thay vì import ProductsModule.
      { name: User.name, schema: UserSchema },
    ]),
    OrdersModule, // model Order: kiểm đơn đã giao chưa
    ProductsModule, // model Product: cập nhật điểm sao
    ProfilesModule, // tên + ảnh người viết
    ShopsModule, // gian hàng của người bán
    AuthModule, // JwtAuthGuard
    NotificationsModule, // báo đánh giá mới cho người bán
    AdminAuthModule, // AdminAuthGuard (trang quản trị)
    AuditLogModule, // ghi nhật ký khi admin ẩn/gỡ ẩn đánh giá hoặc phản hồi
    PlatformSettingsModule, // hạn sửa đánh giá
  ],
  controllers: [
    ProductReviewsController,
    ReviewsController,
    ShopReviewsController,
    AdminReviewsController,
  ],
  providers: [ReviewsService],
  exports: [ReviewsService, MongooseModule],
})
export class ReviewsModule {}
