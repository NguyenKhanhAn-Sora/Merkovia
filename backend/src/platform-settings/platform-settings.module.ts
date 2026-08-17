import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PlatformSettings,
  PlatformSettingsSchema,
} from './schemas/platform-settings.schema';
import { PlatformSettingsService } from './platform-settings.service';
import { AdminPlatformSettingsController } from './platform-settings.controller';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

/**
 * Cấu hình chính sách toàn sàn — module LÁ (không phụ thuộc bất kỳ module
 * nghiệp vụ nào: Orders/Payments/Reviews/ShopReports...), nên các module đó
 * import ngược lại `PlatformSettingsModule` mà không rủi ro vòng lặp, dù bao
 * nhiêu module cùng import cũng an toàn.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlatformSettings.name, schema: PlatformSettingsSchema },
    ]),
    AdminAuthModule, // AdminAuthGuard (trang quản trị)
    AuditLogModule, // ghi nhật ký khi admin sửa cấu hình sàn
  ],
  controllers: [AdminPlatformSettingsController],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
