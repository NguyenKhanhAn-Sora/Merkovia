import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AiChatMessage,
  AiChatMessageSchema,
} from './schemas/ai-chat-message.schema';
import { AiChatService } from './ai-chat.service';
import { AiChatController } from './ai-chat.controller';
import { AuthModule } from '../auth/auth.module';
import { OrdersModule } from '../orders/orders.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { FollowsModule } from '../follows/follows.module';

/**
 * Không cần làm module lá: không có module nghiệp vụ nào khác cần import
 * ngược lại `AiChatModule` (chỉ `app.module.ts` dùng nó) — nên import thẳng
 * các module cần dùng, không lo vòng lặp.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiChatMessage.name, schema: AiChatMessageSchema },
    ]),
    AuthModule, // JwtAuthGuard
    OrdersModule, // tra đơn hàng của buyer/seller
    CatalogModule, // tra sản phẩm/gian hàng công khai
    PlatformSettingsModule, // số liệu chính sách sàn
    FollowsModule, // danh sách gian hàng buyer đang theo dõi
  ],
  controllers: [AiChatController],
  providers: [AiChatService],
})
export class AiChatModule {}
