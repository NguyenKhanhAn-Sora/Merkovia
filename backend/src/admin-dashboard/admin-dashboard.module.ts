import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { UsersModule } from '../users/users.module';
import { ShopsModule } from '../shops/shops.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import {
  ShopReport,
  ShopReportSchema,
} from '../shop-reports/schemas/shop-report.schema';
import { Payout, PayoutSchema } from '../payments/schemas/payout.schema';

/**
 * Số liệu trang chủ Kênh Quản trị. `ShopReportsModule`/`PaymentsModule`
 * không export model của mình ra ngoài (chỉ export service) nên đăng ký
 * riêng `ShopReport`/`Payout` ở đây thay vì import cả hai module đó — chỉ
 * cần ĐỌC vài con số, không cần toàn bộ service/controller đi kèm.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShopReport.name, schema: ShopReportSchema },
      { name: Payout.name, schema: PayoutSchema },
    ]),
    UsersModule,
    ShopsModule,
    OrdersModule,
    ProductsModule,
    AdminAuthModule,
    AuditLogModule,
  ],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
})
export class AdminDashboardModule {}
