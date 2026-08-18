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
import { BannersService } from './banners.service';
import { AdminAuthGuard, CurrentAdmin } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import {
  CreateBannerDto,
  ReorderBannersDto,
  SetBannerVisibilityDto,
  UpdateBannerDto,
} from './dto/admin-banner.dto';

/** Quản lý banner carousel trang chủ — thêm/sửa/sắp xếp/bật-tắt/xoá. */
@Controller('admin/banners')
@UseGuards(AdminAuthGuard)
export class AdminBannersController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  list() {
    return this.banners.adminList();
  }

  @Post()
  create(@CurrentAdmin() admin: AdminPrincipal, @Body() dto: CreateBannerDto) {
    return this.banners.adminCreate(admin, dto);
  }

  @Patch(':id')
  update(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateBannerDto,
  ) {
    return this.banners.adminUpdate(admin, id, dto);
  }

  /** Kéo-thả sắp xếp lại: client gửi đúng thứ tự mới của TOÀN BỘ banner. */
  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  reorder(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() dto: ReorderBannersDto,
  ) {
    return this.banners.adminReorder(admin, dto.orderedIds);
  }

  @Patch(':id/visibility')
  setVisibility(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: SetBannerVisibilityDto,
  ) {
    return this.banners.adminSetVisibility(admin, id, dto.isActive);
  }

  @Delete(':id')
  remove(@CurrentAdmin() admin: AdminPrincipal, @Param('id') id: string) {
    return this.banners.adminDelete(admin, id);
  }
}
