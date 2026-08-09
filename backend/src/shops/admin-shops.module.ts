import { Module } from '@nestjs/common';
import { AdminShopsService } from './admin-shops.service';
import { AdminShopsController } from './admin-shops.controller';
import { ShopsModule } from './shops.module';
import { UsersModule } from '../users/users.module';
import { ShopSuspensionModule } from '../shop-reports/shop-suspension.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../auth/mail.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

/**
 * Module TOP-LEVEL riêng — xem lý do ở `AdminUsersModule` (tránh vòng lặp
 * module: `NotificationsModule` import `AuthModule` → `ShopsModule`, nên
 * KHÔNG được nhúng thẳng vào `ShopsModule`).
 */
@Module({
  imports: [
    ShopsModule,
    UsersModule,
    ShopSuspensionModule,
    NotificationsModule,
    MailModule,
    AdminAuthModule,
    AuditLogModule,
  ],
  controllers: [AdminShopsController],
  providers: [AdminShopsService],
})
export class AdminShopsModule {}
