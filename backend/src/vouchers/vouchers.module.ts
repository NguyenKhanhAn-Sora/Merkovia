import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Voucher,
  VoucherRedemption,
  VoucherRedemptionSchema,
  VoucherSchema,
} from './schemas/voucher.schema';
import { VouchersService } from './vouchers.service';
import { ShopVouchersController, VouchersController } from './vouchers.controller';
import { ShopsModule } from '../shops/shops.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Module top-level, KHÔNG nhúng vào `ProductsModule` — bài học cũ về vòng lặp
 * import NestJS: `OrdersModule` cần `VouchersService` để tính giảm giá lúc
 * đặt hàng, và không có module domain nào khác cần import ngược lại module
 * này, nên không cần làm "module lá" như `PlatformSettingsModule`.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Voucher.name, schema: VoucherSchema },
      { name: VoucherRedemption.name, schema: VoucherRedemptionSchema },
    ]),
    ShopsModule, // Shop model cho requireShop()
    AuthModule, // JwtAuthGuard
  ],
  controllers: [ShopVouchersController, VouchersController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class VouchersModule {}
