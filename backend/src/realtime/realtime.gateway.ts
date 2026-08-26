import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Server, Socket } from 'socket.io';
import { AccountService } from '../auth/account.service';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { User, UserDocument } from '../users/schemas/user.schema';
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
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  /**
   * Đếm số kết nối đang mở của MỖI người trong MỖI app (`audience:userId` → số).
   * Một người mở nhiều tab → nhiều kết nối; chỉ coi là offline khi cái cuối đóng.
   */
  private readonly online = new Map<string, number>();

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly accounts: AccountService,
    private readonly adminAuth: AdminAuthService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const scope = scopeFromSocket(client.handshake);

      // Admin xác thực HOÀN TOÀN KHÁC buyer/seller: không có bản ghi `User`
      // nào cho admin (chỉ một tài khoản gốc cấu hình qua `.env`, `sub` luôn
      // là chuỗi cố định "root-admin" — xem `AdminAuthService`). Đi qua
      // `AccountService.userFromAccessToken` sẽ tra `User` bằng một chuỗi
      // không phải ObjectId hợp lệ và ném lỗi thay vì từ chối sạch sẽ, nên
      // phải tách nhánh xác thực RIÊNG trước khi chạm tới đường buyer/seller.
      if (scope === 'admin') {
        const token = readCookieFromHeader(
          client.handshake.headers.cookie,
          accessCookieName('admin'),
        );
        const admin = this.adminAuth.principalFromAccessToken(token);
        client.data.userId = admin.id;
        client.data.audience = 'admin' as AppScope;
        await client.join(roomOf(admin.id, 'admin'));
        const key = roomOf(admin.id, 'admin');
        this.online.set(key, (this.online.get(key) ?? 0) + 1);
        return;
      }

      const token = readCookieFromHeader(
        client.handshake.headers.cookie,
        accessCookieName(scope),
      );
      // Ném nếu token thiếu/hết hạn/bị thu hồi — cùng đường kiểm với REST.
      const user = await this.accounts.userFromAccessToken(token, scope);

      const userId = String(user._id);
      client.data.userId = userId;
      client.data.audience = scope;
      await client.join(roomOf(userId, scope));

      const key = roomOf(userId, scope);
      this.online.set(key, (this.online.get(key) ?? 0) + 1);
      this.touchActive(userId);
    } catch {
      // Chưa đăng nhập hoặc token hỏng: ngắt lịch sự. Client tự kết nối lại sau
      // khi gia hạn phiên; trong lúc đó vẫn dùng REST bình thường.
      client.emit('unauthorized');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = client.data.userId as string | undefined;
    const audience = client.data.audience as AppScope | undefined;
    if (!userId || !audience) return;
    const key = roomOf(userId, audience);
    const left = (this.online.get(key) ?? 1) - 1;
    if (left <= 0) {
      this.online.delete(key);
      // Rời hẳn (không còn tab nào) → ghi mốc hoạt động cuối. Admin không có
      // bản ghi `User` (id luôn là chuỗi "root-admin", không phải ObjectId)
      // nên bỏ qua — gọi vào đây chỉ tổ thất bại một truy vấn vô ích.
      if (audience !== 'admin') this.touchActive(userId);
    } else {
      this.online.set(key, left);
    }
  }

  /** Người này có đang mở app (`audience`) không. */
  isOnline(userId: string, audience: AppScope): boolean {
    return (this.online.get(roomOf(userId, audience)) ?? 0) > 0;
  }

  /** Ghi mốc "còn hoạt động" — fail-safe, không chặn luồng socket. */
  private touchActive(userId: string): void {
    void this.userModel
      .updateOne({ _id: userId }, { $set: { lastActiveAt: new Date() } })
      .catch(() => undefined);
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
