import { Module } from '@nestjs/common';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthGuard } from './admin-auth.guard';

@Module({
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminAuthGuard],
  // Các module admin khác (quản lý sản phẩm/đơn/người dùng…) sẽ dùng
  // AdminAuthGuard để bảo vệ route, tương tự JwtAuthGuard của buyer/seller.
  exports: [AdminAuthService, AdminAuthGuard],
})
export class AdminAuthModule {}
