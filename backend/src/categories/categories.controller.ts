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
  UseGuards,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { AdminAuthGuard, CurrentAdmin } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import {
  CreateCategoryDto,
  ReorderCategoriesDto,
  SetCategoryVisibilityDto,
  UpdateCategoryDto,
} from './dto/admin-category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** Cây danh mục — công khai (seller chọn khi đăng bán, buyer dùng để duyệt). */
  @Get()
  tree() {
    return this.categories.getTree();
  }
}

/** Quản lý cây danh mục — thêm/sửa/sắp xếp/tắt hiển thị/xoá. */
@Controller('admin/categories')
@UseGuards(AdminAuthGuard)
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  tree() {
    return this.categories.adminTree();
  }

  @Post()
  create(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categories.adminCreate(admin, dto);
  }

  @Patch(':id')
  update(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.adminUpdate(admin, id, dto);
  }

  /** Kéo-thả sắp xếp lại: client gửi đúng thứ tự mới của cả nhóm anh em. */
  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  reorder(@Body() dto: ReorderCategoriesDto) {
    return this.categories.adminReorder(dto.parentId, dto.orderedIds);
  }

  @Patch(':id/visibility')
  setVisibility(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: SetCategoryVisibilityDto,
  ) {
    return this.categories.adminSetVisibility(admin, id, dto.isActive);
  }

  @Delete(':id')
  remove(@CurrentAdmin() admin: AdminPrincipal, @Param('id') id: string) {
    return this.categories.adminDelete(admin, id);
  }
}
