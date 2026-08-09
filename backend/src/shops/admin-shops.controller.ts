import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminShopsService } from './admin-shops.service';
import { QueryAdminShopsDto, SuspendShopDto } from './dto/admin-shops.dto';
import { AdminAuthGuard, CurrentAdmin } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';

@Controller('admin/shops')
@UseGuards(AdminAuthGuard)
export class AdminShopsController {
  constructor(private readonly shops: AdminShopsService) {}

  @Get()
  list(@Query() query: QueryAdminShopsDto) {
    return this.shops.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.shops.detail(id);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: SuspendShopDto,
  ) {
    return this.shops.suspend(admin, id, dto.reason, dto.suspendDays);
  }

  @Post(':id/unsuspend')
  @HttpCode(HttpStatus.OK)
  unsuspend(@CurrentAdmin() admin: AdminPrincipal, @Param('id') id: string) {
    return this.shops.unsuspend(admin, id);
  }
}
