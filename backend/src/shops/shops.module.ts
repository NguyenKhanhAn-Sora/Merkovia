import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Shop, ShopSchema } from './schemas/shop.schema';

/** Đăng ký Shop model để AuthModule (đăng ký seller) và sau này SellerModule dùng. */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Shop.name, schema: ShopSchema }]),
  ],
  exports: [MongooseModule],
})
export class ShopsModule {}
