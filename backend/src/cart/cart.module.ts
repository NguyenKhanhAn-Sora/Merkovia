import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Cart, CartSchema } from './schemas/cart.schema';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { ProductsModule } from '../products/products.module';
import { ShopsModule } from '../shops/shops.module';
import { AuthModule } from '../auth/auth.module';

/** Giỏ hàng lưu server (đồng bộ đa thiết bị) cho người mua đã đăng nhập. */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cart.name, schema: CartSchema }]),
    ProductsModule, // Product model: enrich tên/giá/tồn kho hiện tại
    ShopsModule, // Shop model: tên/slug gian hàng để gom theo shop
    AuthModule, // JwtAuthGuard
  ],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
