import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { AuthModule } from '../auth/auth.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';

@Module({
  // `JwtAuthGuard` chặn người lạ đẩy file lên kho (buyer/seller); `AdminAuthGuard`
  // cho route banner (chỉ admin).
  imports: [AuthModule, AdminAuthModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
