import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { AuthModule } from '../auth/auth.module';

/**
 * Hạ tầng real-time dùng chung (socket.io).
 *
 * Tách riêng khỏi `notifications` vì tin nhắn cũng cần đúng cổng socket ấy —
 * một tiến trình chỉ nên có MỘT socket server, và mỗi client chỉ mở MỘT kết
 * nối cho cả thông báo lẫn chat.
 */
@Module({
  imports: [AuthModule], // AccountService: xác thực handshake bằng cookie phiên
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
