import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Category, CategorySchema } from './schemas/category.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { CategoriesService } from './categories.service';
import {
  AdminCategoriesController,
  CategoriesController,
} from './categories.controller';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

/**
 * Cố ý KHÔNG import ProductsModule dù cần đếm/kiểm sản phẩm: ProductsModule
 * đã import module này (để kiểm danh mục), import ngược lại sẽ thành phụ
 * thuộc vòng. Đăng ký thẳng schema Product — giống cách PaymentsModule làm
 * với Order.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    AdminAuthModule,
    AuditLogModule,
  ],
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService, MongooseModule],
})
export class CategoriesModule {}
