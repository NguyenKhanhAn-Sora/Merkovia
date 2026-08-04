import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ShopReportsService } from './shop-reports.service';
import {
  CreateShopReportDto,
  ResolveShopReportDto,
} from './dto/shop-report.dto';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard, CurrentAdmin } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import type { UserDocument } from '../users/schemas/user.schema';

/** Người mua gửi báo cáo vi phạm gian hàng. */
@Controller('shop-reports')
@UseGuards(JwtAuthGuard)
export class ShopReportsController {
  constructor(private readonly shopReports: ShopReportsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUser() user: UserDocument, @Body() dto: CreateShopReportDto) {
    return this.shopReports.create(user, dto);
  }
}

/** Trang "Báo cáo" của Kênh Quản trị. */
@Controller('admin/shop-reports')
@UseGuards(AdminAuthGuard)
export class AdminShopReportsController {
  constructor(private readonly shopReports: ShopReportsService) {}

  /** Hàng đợi ưu tiên — gộp theo shop, sắp theo mức độ khẩn cấp. */
  @Get()
  queue() {
    return this.shopReports.priorityQueue();
  }

  @Get('shop/:shopId')
  listForShop(@Param('shopId') shopId: string) {
    return this.shopReports.listForShop(shopId);
  }

  @Post('shop/:shopId/resolve')
  resolve(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('shopId') shopId: string,
    @Body() dto: ResolveShopReportDto,
  ) {
    return this.shopReports.resolve(admin, shopId, dto);
  }

  /** Gỡ đình chỉ sớm — trước hạn, hoặc khi đình chỉ vô thời hạn (cách duy nhất để gỡ). */
  @Post('shop/:shopId/unsuspend')
  unsuspend(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('shopId') shopId: string,
  ) {
    return this.shopReports.unsuspend(admin, shopId);
  }
}
