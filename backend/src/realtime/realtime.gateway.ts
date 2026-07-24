import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AccountService } from '../auth/account.service';
import {
  accessCookieName,
  readCookieFromHeader,
  scopeFromSocket,
  type AppScope,
} from '../common/auth-scope';
import { config } from '../config/config';

/** Tên phòng gom mọi kết nối của MỘT người trong MỘT app. */
function roomOf(userId: string, audience: AppScope): string {
  return `${audience}:${userId}`;
}

/**
 * Cổng socket DUY NHẤT của hệ thống — dùng chung cho thông báo và tin nhắn.
 *
 * 🔴 Socket chỉ là kênh ĐẨY, KHÔNG phải nguồn sự thật: mọi dữ liệu đều đọc/ghi
 * qua REST. Mất socket thì client vẫn dùng được đầy đủ, chỉ không nhận tức
 * thời. Nhờ vậy lỗi ở tầng socket không bao giờ làm hỏng nghiệp vụ.
 *
 * Xác thực bằng chính cookie httpOnly của phiên (đọc theo app như REST), nên
 * không phát sinh cơ chế đăng nhập thứ hai để lệch nhau.
 */
@WebSocketGateway({
  cors: { origin: config.corsOrigin, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly accounts: AccountService) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const scope = scopeFromSocket(client.handshake);
      const token = readCookieFromHeader(
        client.handshake.headers.cookie,
        accessCookieName(scope),
      );
      // Ném nếu token thiếu/hết hạn/bị thu hồi — cùng đường kiểm với REST.
      const user = await this.accounts.userFromAccessToken(token);

      client.data.userId = String(user._id);
      client.data.audience = scope;
      await client.join(roomOf(String(user._id), scope));
    } catch {
      // Chưa đăng nhập hoặc token hỏng: ngắt lịch sự. Client tự kết nối lại sau
      // khi gia hạn phiên; trong lúc đó vẫn dùng REST bình thường.
      client.emit('unauthorized');
      client.disconnect(true);
    }
  }

  /** Đẩy một sự kiện tới mọi thiết bị của người dùng trong đúng app. */
  emitToUser(
    userId: string,
    audience: AppScope,
    event: string,
    payload: unknown,
  ): void {
    if (!this.server) return; // gateway chưa khởi tạo (vd trong unit test)
    this.server.to(roomOf(userId, audience)).emit(event, payload);
  }
}
