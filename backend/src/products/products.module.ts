import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import {
  ModerationLog,
  ModerationLogSchema,
} from './schemas/moderation-log.schema';
import {
  PriceHistory,
  PriceHistorySchema,
} from './schemas/price-history.schema';
import { ProductsService } from './products.service';
import { ProductModerationService } from './product-moderation.service';
import { PriceHistoryService } from './price-history.service';
import { PromotionsService } from './promotions.service';
import {
  AdminPromotionsController,
  PromotionsController,
} from './promotions.controller';
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
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: ModerationLog.name, schema: ModerationLogSchema },
      { name: PriceHistory.name, schema: PriceHistorySchema },
    ]),
    ShopsModule, // để tra gian hàng của người bán + Shop model cho ProductModerationService
    CategoriesModule, // để kiểm tra danh mục + lấy đường dẫn tổ tiên
    AuthModule, // JwtAuthGuard
    AdminAuthModule, // AdminAuthGuard (trang quản trị)
    MediaModule, // xoá ảnh R2 khi dọn thùng rác
    SearchModule, // sinh vector embedding khi tạo/sửa sản phẩm
    NotificationsModule, // báo seller khi AI/admin duyệt hoặc từ chối sản phẩm
    AuditLogModule, // ghi nhật ký khi admin duyệt/từ chối sản phẩm tay
  ],
  controllers: [
    ProductsController,
    AdminProductsController,
    PromotionsController,
    AdminPromotionsController,
  ],
  providers: [
    ProductsService,
    ProductModerationService,
    PriceHistoryService,
    PromotionsService,
  ],
  // OrdersModule dùng ProductsService để giữ/hoàn kho khi tạo & huỷ đơn.
  exports: [MongooseModule, ProductsService, PromotionsService],
})
export class ProductsModule {}
