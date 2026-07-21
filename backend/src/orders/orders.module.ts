import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './schemas/order.schema';
import { OrdersService } from './orders.service';
import { OrdersController, ShopOrdersController } from './orders.controller';
import { ProductsModule } from '../products/products.module';
import { ShopsModule } from '../shops/shops.module';
import { AddressesModule } from '../addresses/addresses.module';
import { PaymentsModule } from '../payments/payments.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    ProductsModule, // ProductsService: giữ/hoàn kho, cộng lượt bán
    ShopsModule, // tra gian hàng của người bán
    AddressesModule, // sổ địa chỉ để dựng trang thanh toán
    PaymentsModule, // PaymentService: tạo phiên thanh toán khi checkout online
    ShippingModule, // ShippingProvider: tính cước vận chuyển
    AuthModule, // JwtAuthGuard
  ],
  controllers: [OrdersController, ShopOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
