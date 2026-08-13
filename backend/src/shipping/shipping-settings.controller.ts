import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ShippingSettingsService } from './shipping-settings.service';
import { UpdateShippingSettingsDto } from './dto/shipping-settings.dto';
import { AdminAuthGuard, CurrentAdmin } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';

/** Trang "Vận chuyển" của Kênh Quản trị — biểu cước toàn sàn, singleton. */
@Controller('admin/shipping')
@UseGuards(AdminAuthGuard)
export class AdminShippingController {
  constructor(private readonly settings: ShippingSettingsService) {}

  @Get()
  get() {
    return this.settings.adminGet();
  }

  @Patch()
  update(
    @CurrentAdmin() admin: AdminPrincipal,
    @Body() dto: UpdateShippingSettingsDto,
  ) {
    return this.settings.adminUpdate(admin, dto);
  }
}
