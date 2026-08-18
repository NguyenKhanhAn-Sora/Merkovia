import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Banner, BannerSchema } from './schemas/banner.schema';
import { BannersService } from './banners.service';
import { AdminBannersController } from './banners.controller';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Banner.name, schema: BannerSchema }]),
    AdminAuthModule,
    AuditLogModule,
    MediaModule,
  ],
  controllers: [AdminBannersController],
  providers: [BannersService],
  // `BannersService` để `CatalogModule` đọc banner đang bật cho trang chủ;
  // `MongooseModule` giống cách `CategoriesModule` xuất, tránh phải tiêm
  // `BannersService` chỉ để lấy schema ở nơi không cần logic admin.
  exports: [BannersService, MongooseModule],
})
export class BannersModule {}
