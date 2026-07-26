import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { EmbeddingService } from './embedding.service';
import { SemanticSearchService } from './semantic-search.service';

/**
 * Tìm kiếm ngữ nghĩa: sinh vector (EmbeddingService) + xếp hạng cosine
 * (SemanticSearchService). Tách riêng để cả ProductsModule (sinh vector khi
 * tạo/sửa hàng) lẫn CatalogModule (xếp hạng lúc tìm) dùng chung mà không vòng.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
  ],
  providers: [EmbeddingService, SemanticSearchService],
  exports: [EmbeddingService, SemanticSearchService],
})
export class SearchModule {}
