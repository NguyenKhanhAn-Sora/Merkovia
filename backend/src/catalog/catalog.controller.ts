import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CatalogService } from './catalog.service';
import { BrowseProductsDto } from './dto/browse-products.dto';

/**
 * Dữ liệu công khai cho trang người mua — KHÔNG cần đăng nhập.
 * Mọi thứ trả ra ở đây là thứ ai cũng xem được, nên service đã lọc kỹ theo
 * trạng thái sản phẩm/gian hàng/biến thể.
 */
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  browse(@Query() query: BrowseProductsDto) {
    return this.catalog.browse(query);
  }

  /** Dải danh mục ở trang chủ, kèm số sản phẩm đang bán. */
  @Get('categories')
  categories() {
    return this.catalog.categoriesWithCounts();
  }

  @Get('products/:slug')
  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  product(@Param('slug') slug: string, @Req() req: Request) {
    return this.catalog.productBySlug(slug, req);
  }

  @Get('shops/:slug')
  shop(@Param('slug') slug: string) {
    return this.catalog.shopBySlug(slug);
  }
}
