import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserThrottlerGuard } from './common/user-throttler.guard';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProfilesModule } from './profiles/profiles.module';
import { AddressesModule } from './addresses/addresses.module';
import { ShopsModule } from './shops/shops.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { CatalogModule } from './catalog/catalog.module';
import { OrdersModule } from './orders/orders.module';
import { ReviewsModule } from './reviews/reviews.module';
import { PaymentsModule } from './payments/payments.module';
import { ShippingModule } from './shipping/shipping.module';
import { AccountModule } from './account/account.module';
import { GeoModule } from './geo/geo.module';
import { MediaModule } from './media/media.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ChatModule } from './chat/chat.module';
import { CartModule } from './cart/cart.module';
import { config } from './config/config';

@Module({
  imports: [
    // Rate limiting: mặc định 120 request/phút mỗi phiên (chống lạm dụng,
    // brute-force). Chưa đăng nhập thì đếm theo IP — xem UserThrottlerGuard.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    // Cron chạy trong tiến trình (dọn thùng rác sản phẩm) — không cần Redis.
    ScheduleModule.forRoot(),
    MongooseModule.forRoot(config.mongoUri),
    UsersModule,
    ProfilesModule,
    AddressesModule,
    ShopsModule,
    CategoriesModule,
    ProductsModule,
    CatalogModule,
    OrdersModule,
    ReviewsModule,
    PaymentsModule,
    ShippingModule,
    AccountModule,
    GeoModule,
    MediaModule,
    RealtimeModule,
    NotificationsModule,
    ChatModule,
    CartModule,
    AuthModule,
  ],
  controllers: [AppController],
  // Đếm theo phiên đăng nhập, không theo IP — nhiều người dùng chung một IP
  // qua NAT nhà mạng/công ty là chuyện bình thường ở VN.
  providers: [AppService, { provide: APP_GUARD, useClass: UserThrottlerGuard }],
})
export class AppModule {}
