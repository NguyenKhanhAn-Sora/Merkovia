import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Conversation,
  ConversationSchema,
} from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ShopsModule } from '../shops/shops.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';

/** Tin nhắn giữa người mua và gian hàng (văn bản). */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    ShopsModule, // Shop model: xác định vai người bán + tên/logo đối phương
    ProfilesModule, // Profile: tên/ảnh người mua cho danh sách phía shop
    AuthModule, // JwtAuthGuard
    RealtimeModule, // cổng socket dùng chung với thông báo
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
