import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import {
  ModerationLog,
  ModerationLogSchema,
} from './schemas/moderation-log.schema';
import { ProductsService } from './products.service';
import { ProductModerationService } from './product-moderation.service';
import { PromotionsService } from './promotions.service';
import { PromotionsController } from './promotions.controller';
import {
  AdminProductsController,
  ProductsController,
} from './products.controller';
import { ShopsModule } from '../shops/shops.module';
import { CategoriesModule } from '../categories/categories.module';
import { AuthModule } from '../auth/auth.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { MediaModule } from '../media/media.module';
import { SearchModule } from '../search/search.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: ModerationLog.name, schema: ModerationLogSchema },
    ]),
    ShopsModule, // để tra gian hàng của người bán + Shop model cho ProductModerationService
    CategoriesModule, // để kiểm tra danh mục + lấy đường dẫn tổ tiên
    AuthModule, // JwtAuthGuard
    AdminAuthModule, // AdminAuthGuard (trang quản trị)
    MediaModule, // xoá ảnh R2 khi dọn thùng rác
    SearchModule, // sinh vector embedding khi tạo/sửa sản phẩm
    NotificationsModule, // báo seller khi AI/admin duyệt hoặc từ chối sản phẩm
  ],
  controllers: [
    ProductsController,
    AdminProductsController,
    PromotionsController,
  ],
  providers: [ProductsService, ProductModerationService, PromotionsService],
  // OrdersModule dùng ProductsService để giữ/hoàn kho khi tạo & huỷ đơn.
  exports: [MongooseModule, ProductsService, PromotionsService],
})
export class ProductsModule {}
