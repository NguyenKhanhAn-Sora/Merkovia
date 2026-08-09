import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShopSuspensionService } from './shop-suspension.service';
import { Shop, ShopSchema } from '../shops/schemas/shop.schema';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Tách riêng khỏi `ShopReportsModule` — `ShopSuspensionService` chỉ cần Shop
 * model + thông báo, không phụ thuộc gì thuộc domain "report". Giờ có thêm
 * `ShopsModule` (quản lý gian hàng chung, đình chỉ trực tiếp không qua report)
 * cũng cần lịch tự động gỡ đình chỉ.
 *
 * 🔴 Đăng ký `Shop` model TRỰC TIẾP (không import `ShopsModule`) — nếu import
 * `ShopsModule` thì `ShopsModule` (chứa `AdminShopsService`, cũng cần
 * `ShopSuspensionService`) sẽ tạo VÒNG LẶP module khi import ngược lại module
 * này. Đăng ký lại schema ở đây an toàn: Mongoose coi các lần đăng ký cùng
 * tên model trên cùng một connection là một, không có tác dụng phụ.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Shop.name, schema: ShopSchema }]),
    NotificationsModule,
  ],
  providers: [ShopSuspensionService],
  exports: [ShopSuspensionService],
})
export class ShopSuspensionModule {}
