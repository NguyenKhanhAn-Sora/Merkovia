import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ViewCounterService } from './view-counter.service';
import { ProductsModule } from '../products/products.module';
import { ShopsModule } from '../shops/shops.module';
import { CategoriesModule } from '../categories/categories.module';
import { SearchModule } from '../search/search.module';
import { config } from '../config/config';

/** Mặt tiền công khai của sàn: duyệt sản phẩm, xem gian hàng, danh mục. */
@Module({
  imports: [
    ProductsModule,
    ShopsModule,
    CategoriesModule,
    SearchModule,
    // Để đọc (tùy chọn) phiên đăng nhập của người xem khi đếm view.
    JwtModule.register({ secret: config.jwt.secret }),
  ],
  controllers: [CatalogController],
  providers: [CatalogService, ViewCounterService],
})
export class CatalogModule {}
