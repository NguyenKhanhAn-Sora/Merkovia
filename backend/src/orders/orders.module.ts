import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './schemas/order.schema';
import { OrdersService } from './orders.service';
import {
  AdminOrdersController,
  OrdersController,
  ShopOrdersController,
} from './orders.controller';
import { ProductsModule } from '../products/products.module';
import { ShopsModule } from '../shops/shops.module';
import { AddressesModule } from '../addresses/addresses.module';
import { PaymentsModule } from '../payments/payments.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AuthModule } from '../auth/auth.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    ProductsModule, // ProductsService: giữ/hoàn kho, cộng lượt bán
    ShopsModule, // tra gian hàng của người bán
    AddressesModule, // sổ địa chỉ để dựng trang thanh toán
    PaymentsModule, // PaymentService: tạo phiên thanh toán khi checkout online
    ShippingModule, // ShippingProvider: tính cước vận chuyển
    AuthModule, // JwtAuthGuard
    AdminAuthModule, // AdminAuthGuard (xử lý tranh chấp thay shop bị đình chỉ)
    NotificationsModule, // báo tin đơn hàng cho hai phía
  ],
  controllers: [OrdersController, ShopOrdersController, AdminOrdersController],
  providers: [OrdersService],
  // Mở model Order ra ngoài (như ProductsModule/ShopsModule) để module đánh
  // giá kiểm được đơn đã giao hay chưa.
  exports: [OrdersService, MongooseModule],
})
export class OrdersModule {}
