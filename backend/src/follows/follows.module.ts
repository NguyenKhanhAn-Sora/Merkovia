import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Follow, FollowSchema } from './schemas/follow.schema';
import { Shop, ShopSchema } from '../shops/schemas/shop.schema';
import { FollowsService } from './follows.service';
import { FollowsController } from './follows.controller';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Module LÁ THẬT SỰ — không import `ProductsModule`/`AccountModule`/
 * `CatalogModule`, dù cả ba đều cần dùng `FollowsService` (theo dõi shop,
 * báo tin khi có sản phẩm/khuyến mãi mới, đếm follower ở trang shop). Đăng
 * ký thẳng schema `Shop` (không import `ShopsModule`) — cùng lý do
 * `CategoriesModule` từng làm với `Product`: tránh phụ thuộc vòng khi nhiều
 * module nghiệp vụ cùng cần import ngược lại đây.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Follow.name, schema: FollowSchema },
      { name: Shop.name, schema: ShopSchema },
    ]),
    AuthModule, // JwtAuthGuard
    NotificationsModule, // báo follower khi shop có sản phẩm/khuyến mãi mới
  ],
  controllers: [FollowsController],
  providers: [FollowsService],
  exports: [FollowsService],
})
export class FollowsModule {}
