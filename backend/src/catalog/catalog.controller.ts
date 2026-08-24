import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CatalogService } from './catalog.service';
import { BrowseProductsDto } from './dto/browse-products.dto';
import { BannersService } from '../banners/banners.service';

/**
 * Dữ liệu công khai cho trang người mua — KHÔNG cần đăng nhập.
 * Mọi thứ trả ra ở đây là thứ ai cũng xem được, nên service đã lọc kỹ theo
 * trạng thái sản phẩm/gian hàng/biến thể.
 */
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly bannersService: BannersService,
  ) {}

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

  /** Banner carousel trang chủ — chỉ banner admin đang bật. */
  @Get('banners')
  banners() {
    return this.bannersService.publicList();
  }

  /**
   * Sản phẩm theo danh sách id, GIỮ NGUYÊN thứ tự truyền vào — dùng cho "Đã
   * xem gần đây" (frontend lưu id ở localStorage). Đăng ký TRƯỚC `products/:slug`
   * để NestJS không hiểu nhầm "by-ids" là một giá trị slug.
   */
  @Get('products/by-ids')
  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  productsByIds(@Query('ids') ids?: string) {
    const list = (ids ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return this.catalog.productsByIds(list);
  }

  @Get('products/:slug')
  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  product(@Param('slug') slug: string, @Req() req: Request) {
    return this.catalog.productBySlug(slug, req);
  }

  /** Sản phẩm liên quan hiển thị ở trang chi tiết sản phẩm. */
  @Get('products/:slug/related')
  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  related(@Param('slug') slug: string) {
    return this.catalog.relatedProducts(slug);
  }

  @Get('shops/:slug')
  shop(@Param('slug') slug: string) {
    return this.catalog.shopBySlug(slug);
  }
}
