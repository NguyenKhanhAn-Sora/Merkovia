import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ShopsModule } from '../shops/shops.module';
import { CategoriesModule } from '../categories/categories.module';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
    ShopsModule, // để tra gian hàng của người bán
    CategoriesModule, // để kiểm tra danh mục + lấy đường dẫn tổ tiên
    AuthModule, // JwtAuthGuard
    MediaModule, // xoá ảnh R2 khi dọn thùng rác
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [MongooseModule],
})
export class ProductsModule {}
