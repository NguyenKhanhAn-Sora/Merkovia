import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ProductsModule } from '../products/products.module';
import { ShopsModule } from '../shops/shops.module';
import { CategoriesModule } from '../categories/categories.module';

/** Mặt tiền công khai của sàn: duyệt sản phẩm, xem gian hàng, danh mục. */
@Module({
  imports: [ProductsModule, ShopsModule, CategoriesModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
