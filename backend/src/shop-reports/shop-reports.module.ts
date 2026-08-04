import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShopReport, ShopReportSchema } from './schemas/shop-report.schema';
import { ShopReportsService } from './shop-reports.service';
import { ShopSuspensionService } from './shop-suspension.service';
import {
  AdminShopReportsController,
  ShopReportsController,
} from './shop-reports.controller';
import { ShopsModule } from '../shops/shops.module';
import { OrdersModule } from '../orders/orders.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

/** Người mua báo cáo gian hàng vi phạm; admin xem hàng đợi ưu tiên và xử lý. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShopReport.name, schema: ShopReportSchema },
    ]),
    ShopsModule,
    OrdersModule, // model Order: xác minh đơn kèm theo đúng người gửi + đúng shop
    UsersModule, // email chủ shop để gửi thông báo vi phạm
    AuthModule, // JwtAuthGuard (người mua) + MailService
    AdminAuthModule, // AdminAuthGuard (trang quản trị)
    NotificationsModule, // báo vi phạm real-time cho gian hàng
  ],
  controllers: [ShopReportsController, AdminShopReportsController],
  providers: [ShopReportsService, ShopSuspensionService],
})
export class ShopReportsModule {}
