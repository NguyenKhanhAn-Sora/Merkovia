import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShopReport, ShopReportSchema } from './schemas/shop-report.schema';
import { ShopReportsService } from './shop-reports.service';
import { ShopSuspensionModule } from './shop-suspension.module';
import {
  AdminShopReportsController,
  ShopReportsController,
} from './shop-reports.controller';
import { ShopsModule } from '../shops/shops.module';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { ProductsModule } from '../products/products.module';
import { AuthModule } from '../auth/auth.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

/** Người mua báo cáo gian hàng vi phạm; admin xem hàng đợi ưu tiên và xử lý. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShopReport.name, schema: ShopReportSchema },
    ]),
    ShopsModule,
    OrdersModule, // model Order: xác minh đơn kèm theo, hồ sơ shop, ngữ cảnh đơn hàng
    UsersModule, // email chủ shop để gửi thông báo vi phạm
    ReviewsModule, // model Review: điểm đánh giá trong hồ sơ shop
    ProductsModule, // model Product: số sản phẩm đang bán / từng bị từ chối
    AuthModule, // JwtAuthGuard (người mua) + MailService
    AdminAuthModule, // AdminAuthGuard (trang quản trị)
    NotificationsModule, // báo vi phạm real-time cho gian hàng
    AuditLogModule, // ghi nhật ký khi admin xử lý report/gỡ đình chỉ
    ShopSuspensionModule, // lịch tự động gỡ đình chỉ (tách riêng, xem shop-suspension.module.ts)
  ],
  controllers: [ShopReportsController, AdminShopReportsController],
  providers: [ShopReportsService],
})
export class ShopReportsModule {}
