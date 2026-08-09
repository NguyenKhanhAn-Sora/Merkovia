import { Module } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { AdminUsersController } from './admin-users.controller';
import { UsersModule } from './users.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { ShopsModule } from '../shops/shops.module';
import { ShopSuspensionModule } from '../shop-reports/shop-suspension.module';
import { MailModule } from '../auth/mail.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

/**
 * Module TOP-LEVEL riêng (không nhúng vào `UsersModule`) — `UsersModule` được
 * `AuthModule` import, và `NotificationsModule` (dùng bởi `ShopSuspensionModule`)
 * lại import `AuthModule` để lấy `JwtAuthGuard`. Nếu nhúng thẳng vào
 * `UsersModule`, đồ thị module sẽ vòng: UsersModule → ShopSuspensionModule →
 * NotificationsModule → AuthModule → UsersModule. Đăng ký rời như một module
 * chỉ TIÊU THỤ (không ai import ngược lại) tránh hẳn vòng lặp này — giống
 * cách `AdminDashboardModule` đã làm.
 */
@Module({
  imports: [
    UsersModule,
    ProfilesModule,
    ShopsModule,
    ShopSuspensionModule,
    MailModule,
    AdminAuthModule,
    AuditLogModule,
  ],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminUsersModule {}
