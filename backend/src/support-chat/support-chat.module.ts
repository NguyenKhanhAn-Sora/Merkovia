import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SupportConversation,
  SupportConversationSchema,
  SupportMessage,
  SupportMessageSchema,
} from './schemas/support-chat.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { SupportChatService } from './support-chat.service';
import {
  AdminSupportChatController,
  SupportChatController,
} from './support-chat.controller';
import { ShopsModule } from '../shops/shops.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { AuthModule } from '../auth/auth.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { RealtimeModule } from '../realtime/realtime.module';

/**
 * Chat hỗ trợ (CSKH) — người dùng với ĐỘI NGŨ ADMIN, tách khỏi `chat/` (mua
 * bán giữa buyer và một shop cụ thể). Top-level, không nhúng vào `chat` hay
 * `admin-dashboard` để tránh vòng lặp import NestJS (bài học từ các module
 * admin trước — xem `merkovia-admin-users-shops` trong bộ nhớ dự án).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupportConversation.name, schema: SupportConversationSchema },
      { name: SupportMessage.name, schema: SupportMessageSchema },
      { name: User.name, schema: UserSchema },
    ]),
    ShopsModule, // Shop model: tên gian hàng khi hội thoại thuộc vai seller
    ProfilesModule, // Profile: tên/ảnh người dùng cho hộp thư admin
    AuthModule, // JwtAuthGuard
    AdminAuthModule, // AdminAuthGuard + CurrentAdmin
    RealtimeModule, // cổng socket dùng chung
  ],
  controllers: [SupportChatController, AdminSupportChatController],
  providers: [SupportChatService],
  exports: [SupportChatService],
})
export class SupportChatModule {}
