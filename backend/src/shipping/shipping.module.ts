import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ShippingProvider,
  TableShippingProvider,
} from './shipping.provider';
import {
  ShippingSettings,
  ShippingSettingsSchema,
} from './schemas/shipping-settings.schema';
import { ShippingSettingsService } from './shipping-settings.service';
import { AdminShippingController } from './shipping-settings.controller';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

/**
 * Tính cước vận chuyển.
 *
 * Đổi sang hãng thật (GHN / GHTK / Viettel Post) chỉ là viết một lớp con của
 * `ShippingProvider` rồi đổi dòng dưới đây — nghiệp vụ đơn hàng và giao diện
 * không phải sửa gì.
 *
 * 🔴 `TableShippingProvider` đăng ký làm provider CỦA CHÍNH NÓ, còn token
 * `ShippingProvider` chỉ `useExisting` TRỎ VỀ cùng một instance đó — không
 * phải `useClass` tạo instance MỚI. Nếu dùng `useClass` ở đây, sẽ có HAI
 * instance `TableShippingProvider` tách biệt (một cho mỗi token), mỗi cái tự
 * giữ cache biểu cước riêng: `ShippingSettingsService` gọi `refreshFromDb()`
 * trên instance nó inject trực tiếp, còn `OrdersService` (inject qua token
 * `ShippingProvider`) vẫn dùng cache CŨ của instance kia — admin sửa cước mà
 * đơn hàng vẫn tính theo giá cũ cho tới khi restart server.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShippingSettings.name, schema: ShippingSettingsSchema },
    ]),
    AdminAuthModule, // AdminAuthGuard (trang quản trị)
    AuditLogModule, // ghi nhật ký khi admin sửa biểu cước
  ],
  controllers: [AdminShippingController],
  providers: [
    TableShippingProvider,
    { provide: ShippingProvider, useExisting: TableShippingProvider },
    ShippingSettingsService,
  ],
  exports: [ShippingProvider],
})
export class ShippingModule {}
