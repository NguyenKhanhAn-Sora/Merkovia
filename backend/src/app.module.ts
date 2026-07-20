import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { GeoModule } from './geo/geo.module';
import { MediaModule } from './media/media.module';
import { config } from './config/config';

@Module({
  imports: [
    // Rate limiting: mặc định 120 request/phút/IP (chống lạm dụng, brute-force).
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
    GeoModule,
    MediaModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
