import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ProductsService } from './products.service';
import { ProductModerationService } from './product-moderation.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import {
  ModerateProductDto,
  QueryAdminProductsDto,
} from './dto/admin-products.dto';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard, CurrentAdmin } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import type { UserDocument } from '../users/schemas/user.schema';

/** Quản lý sản phẩm trong Kênh Người Bán — mọi route đều yêu cầu đăng nhập. */
@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  create(@CurrentUser() user: UserDocument, @Body() dto: CreateProductDto) {
    return this.products.create(user, dto);
  }

  /** Danh sách sản phẩm của chính shop đang đăng nhập. */
  @Get('mine')
  listMine(
    @CurrentUser() user: UserDocument,
    @Query() query: QueryProductsDto,
  ) {
    return this.products.listMine(user, query);
  }

  @Get(':id')
  getOne(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.products.getMine(user, id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  update(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.products.remove(user, id);
  }

  /** Khôi phục sản phẩm khỏi thùng rác (trong hạn 30 ngày). */
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.products.restore(user, id);
  }
}

/** Hàng đợi kiểm duyệt sản phẩm (AI + tay) trong Kênh Quản trị. */
@Controller('admin/products')
@UseGuards(AdminAuthGuard)
export class AdminProductsController {
  constructor(private readonly moderation: ProductModerationService) {}

  @Get()
  list(@Query() query: QueryAdminProductsDto) {
    return this.moderation.adminList(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.moderation.adminDetail(id);
  }

  @Post(':id/moderate')
  @HttpCode(HttpStatus.OK)
  moderate(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: ModerateProductDto,
  ) {
    return this.moderation.adminModerate(admin, id, dto.action, dto.reason);
  }
}
