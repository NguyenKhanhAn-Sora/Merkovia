import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePlatformSettingsDto } from './dto/platform-settings.dto';
import { AdminAuthGuard, CurrentAdmin } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';

/** Trang "Cài đặt" của Kênh Quản trị — cấu hình chính sách toàn sàn, singleton. */
@Controller('admin/platform-settings')
@UseGuards(AdminAuthGuard)
export class AdminPlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  get() {
    return this.settings.adminGet();
  }

  @Patch()
  update(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() dto: UpdatePlatformSettingsDto,
  ) {
    return this.settings.adminUpdate(admin, dto);
  }
}
