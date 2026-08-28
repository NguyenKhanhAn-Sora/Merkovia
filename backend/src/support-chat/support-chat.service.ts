import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SupportConversation,
  SupportConversationDocument,
  SupportMessage,
  SupportMessageDocument,
  type SupportUserRole,
} from './schemas/support-chat.schema';
import { Profile, ProfileDocument } from '../profiles/schemas/profile.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';

interface OutgoingImage {
  url: string;
  key?: string;
}

const MSG_PAGE = 30;
/** Danh tính hiển thị cố định phía admin — khớp mô hình "một hộp thư chung". */
const SUPPORT_PEER = { name: 'Merkovia Support' };

/**
 * Tin tự động — gửi NGAY khi người dùng vừa mở lại một hội thoại (mới toanh
 * hoặc vừa được admin đóng) để họ không cảm giác bị im lặng trong lúc chờ.
 * Gắn `senderRole: 'admin'` (không phải role thứ ba) vì với người dùng, đây
 * vẫn là "phía CSKH" trả lời — tách thêm một role chỉ cho một câu chào là
 * phức tạp hoá không cần thiết.
 */
const AUTO_GREETING_TEXT =
  'Cảm ơn bạn đã liên hệ Merkovia Support! Đội ngũ CSKH sẽ phản hồi trong thời gian sớm nhất, mong bạn vui lòng chờ trong giây lát 🙏';

@Injectable()
export class SupportChatService {
  private readonly logger = new Logger(SupportChatService.name);

  constructor(
    @InjectModel(SupportConversation.name)
    private readonly convModel: Model<SupportConversationDocument>,
    @InjectModel(SupportMessage.name)
    private readonly msgModel: Model<SupportMessageDocument>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly gateway: RealtimeGateway,
  ) {}

  /* ------------------------------ Người dùng ----------------------------- */

  /**
   * Lấy hoặc tạo hội thoại CSKH của người dùng — mỗi người chỉ có MỘT hội
   * thoại theo từng vai, mở lần đầu ngay khi họ vào trang Hỗ trợ.
   *
   * `findOneAndUpdate` + upsert: mở hai tab cùng lúc không tạo ra hai hội
   * thoại (khoá duy nhất `{user, userRole}` chốt lần cuối).
   */
  async openMine(user: UserDocument, role: SupportUserRole) {
    const conv = await this.convModel.findOneAndUpdate(
      { user: user._id, userRole: role },
      {
        $setOnInsert: {
          user: user._id,
          userRole: role,
          lastMessageAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return { conversation: this.shapeForUser(conv) };
  }

  private async requireMine(
    user: UserDocument,
    role: SupportUserRole,
  ): Promise<SupportConversationDocument> {
    const conv = await this.convModel.findOne({ user: user._id, userRole: role });
    if (!conv) throw new NotFoundException('Chưa có cuộc trò chuyện nào.');
    return conv;
  }

  async myMessages(user: UserDocument, role: SupportUserRole, before?: string) {
    const conv = await this.requireMine(user, role);
    return this.pageMessages(conv._id, before);
  }

  async unreadForMine(user: UserDocument, role: SupportUserRole) {
    const conv = await this.convModel
      .findOne({ user: user._id, userRole: role })
      .select('userUnread')
      .lean();
    return { unread: conv?.userUnread ?? 0 };
  }

  async sendAsUser(
    user: UserDocument,
    role: SupportUserRole,
    payload: { text?: string; images?: OutgoingImage[] },
  ) {
    // Cùng cơ chế get-or-create với `openMine` — người dùng có thể nhắn thẳng
    // mà chưa từng "mở" hội thoại trước (VD gọi API trực tiếp từ widget).
    const conv = await this.convModel.findOneAndUpdate(
      { user: user._id, userRole: role },
      { $setOnInsert: { user: user._id, userRole: role, lastMessageAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    /**
     * 🔴 KHÔNG dùng "hội thoại vừa được tạo hay chưa" để quyết định có chào
     * tự động hay không — trang `/support` gọi `POST open` để get-or-create
     * hội thoại NGAY khi mở trang (trước khi người dùng gõ gì), nên tới lúc
     * người dùng gửi tin thật đầu tiên thì hội thoại đã tồn tại rồi, khiến
     * "isNew theo hội thoại" luôn sai (đã tự kiểm chứng: gọi thẳng API bằng
     * script rời thì chào đúng, nhưng qua trang thật thì không — vì trang
     * đã âm thầm tạo hội thoại trước đó). Tín hiệu đúng phải là "hội thoại
     * NÀY đã có tin nhắn nào chưa", không phải "hội thoại có tồn tại chưa".
     */
    const hadMessagesBefore = await this.msgModel.exists({ conversation: conv._id });
    const isFirstMessageEver = !hadMessagesBefore;
    const wasClosed = conv.status === 'closed';

    const msg = await this.createMessage(conv, 'user', payload);

    // Nhắn lại vào hội thoại đã đóng thì tự mở lại — admin cần thấy ngay,
    // không phải chờ người dùng bấm nút "Mở lại" nào đó không tồn tại. Admin
    // TỰ đóng nhầm cũng tự sửa được theo đúng cách này: chỉ cần người dùng
    // gõ thêm một tin là hội thoại quay lại "Đang mở" ngay lập tức.
    if (wasClosed) {
      await this.convModel.updateOne({ _id: conv._id }, { $set: { status: 'open' } });
    }
    const status: 'open' | 'closed' = 'open';

    await this.emitToAdmin('support:message', {
      conversationId: String(conv._id),
      message: msg,
      status,
    });

    // Chào tự động khi: hội thoại MỚI TOANH (lần đầu liên hệ), hoặc VỪA được
    // mở lại từ trạng thái đã đóng (với người dùng, cảm giác y hệt lần đầu
    // liên hệ lại — họ cần biết có người sẽ xem tin, không phải im lặng).
    // Cố tình KHÔNG chào lại ở mọi tin nhắn tiếp theo trong một hội thoại
    // đang mở bình thường — chào liên tục mỗi tin sẽ gây phiền, không phải
    // trấn an.
    if (isFirstMessageEver || wasClosed) {
      const auto = await this.createAutoReply(conv, AUTO_GREETING_TEXT);
      this.gateway.emitToUser(String(user._id), role, 'support:message', {
        conversationId: String(conv._id),
        message: auto,
        status,
      });
      await this.emitToAdmin('support:message', {
        conversationId: String(conv._id),
        message: auto,
        status,
      });
    }

    return { message: msg };
  }

  async markReadAsUser(user: UserDocument, role: SupportUserRole) {
    const conv = await this.requireMine(user, role);
    await Promise.all([
      this.convModel.updateOne({ _id: conv._id }, { $set: { userUnread: 0 } }),
      this.msgModel.updateMany(
        { conversation: conv._id, senderRole: 'admin', readAt: null },
        { $set: { readAt: new Date() } },
      ),
    ]);
    await this.emitToAdmin('support:read', { conversationId: String(conv._id) });
    return { ok: true };
  }

  /* -------------------------------- Admin --------------------------------- */

  async adminList(status: 'open' | 'closed' | 'all' = 'open') {
    const filter = status === 'all' ? {} : { status };
    const convs = await this.convModel
      .find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(200);

    const [counts, shaped] = await Promise.all([
      this.statusCounts(),
      this.shapeForAdmin(convs),
    ]);
    return { items: shaped, counts };
  }

  private async statusCounts() {
    const rows = await this.convModel.aggregate<{ _id: string; n: number }>([
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]);
    const counts: Record<string, number> = { open: 0, closed: 0, all: 0 };
    for (const r of rows) {
      counts[r._id] = r.n;
      counts.all += r.n;
    }
    return counts;
  }

  private async requireConversation(id: string): Promise<SupportConversationDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy cuộc trò chuyện.');
    }
    const conv = await this.convModel.findById(id);
    if (!conv) throw new NotFoundException('Không tìm thấy cuộc trò chuyện.');
    return conv;
  }

  async adminMessages(id: string, before?: string) {
    const conv = await this.requireConversation(id);
    return this.pageMessages(conv._id, before);
  }

  async adminSend(
    admin: AdminPrincipal,
    id: string,
    payload: { text?: string; images?: OutgoingImage[] },
  ) {
    const conv = await this.requireConversation(id);
    // Admin chủ động nhắn tiếp vào một hội thoại đã đóng — rõ ràng không còn
    // "đã xong" nữa, tự mở lại luôn thay vì bắt admin bấm thêm nút "Mở lại".
    const wasClosed = conv.status === 'closed';
    if (wasClosed) {
      await this.convModel.updateOne({ _id: conv._id }, { $set: { status: 'open' } });
    }
    const status: 'open' | 'closed' = 'open';

    const msg = await this.createMessage(conv, 'admin', payload);

    this.gateway.emitToUser(String(conv.user), conv.userRole, 'support:message', {
      conversationId: String(conv._id),
      message: msg,
      status,
    });
    return { message: msg, status };
  }

  async adminMarkRead(id: string) {
    const conv = await this.requireConversation(id);
    await Promise.all([
      this.convModel.updateOne({ _id: conv._id }, { $set: { adminUnread: 0 } }),
      this.msgModel.updateMany(
        { conversation: conv._id, senderRole: 'user', readAt: null },
        { $set: { readAt: new Date() } },
      ),
    ]);
    this.gateway.emitToUser(String(conv.user), conv.userRole, 'support:read', {
      conversationId: String(conv._id),
    });
    return { ok: true };
  }

  async adminSetStatus(admin: AdminPrincipal, id: string, status: 'open' | 'closed') {
    const conv = await this.requireConversation(id);
    if (conv.status === status) {
      throw new BadRequestException(
        status === 'closed'
          ? 'Cuộc trò chuyện này đã được đóng.'
          : 'Cuộc trò chuyện này đang mở.',
      );
    }
    conv.status = status;
    await conv.save();
    this.logger.log(
      `Admin ${admin.email} ${status === 'closed' ? 'đóng' : 'mở lại'} hội thoại CSKH ${conv._id}.`,
    );

    // Báo NGAY cho người dùng nếu họ đang mở sẵn trang Hỗ trợ — không cần đợi
    // họ gửi thêm tin mới thấy trạng thái đổi. Quan trọng nhất ở chiều "đóng":
    // admin lỡ tay đóng thì người dùng biết ngay (dòng thông báo trên trang),
    // thay vì thấy im lặng và tưởng chưa ai xử lý.
    this.gateway.emitToUser(String(conv.user), conv.userRole, 'support:status', {
      conversationId: String(conv._id),
      status,
    });
    return { ok: true };
  }

  /* -------------------------------- Nội bộ --------------------------------- */

  private async createMessage(
    conv: SupportConversationDocument,
    senderRole: 'user' | 'admin',
    payload: { text?: string; images?: OutgoingImage[] },
  ) {
    const body = payload.text?.trim() ?? '';
    const images = (payload.images ?? []).filter((i) => i?.url);
    if (!body && images.length === 0) {
      throw new BadRequestException('Nội dung tin nhắn trống.');
    }

    const msg = await this.msgModel.create({
      conversation: conv._id,
      senderRole,
      text: body || undefined,
      images: images.map((i) => ({ url: i.url, key: i.key })),
    });

    const now = new Date();
    const preview = body || (images.length ? '[Hình ảnh]' : '');
    await this.convModel.updateOne(
      { _id: conv._id },
      {
        $set: {
          lastMessage: { text: preview, senderRole, at: now },
          lastMessageAt: now,
        },
        $inc: senderRole === 'user' ? { adminUnread: 1 } : { userUnread: 1 },
      },
    );

    return this.shapeMessage(msg);
  }

  /**
   * Tin chào tự động — KHÔNG đi qua `createMessage()`: cố tình không cập nhật
   * `lastMessage`/`lastMessageAt` của hội thoại, để bản xem trước trong danh
   * sách phía admin vẫn hiện đúng CÂU HỎI THẬT của người dùng (thứ admin cần
   * đọc) thay vì bị che bởi câu chào máy tự sinh ra ngay sau đó. Vẫn cộng
   * `userUnread` bình thường vì đây là tin thật người dùng cần thấy.
   */
  private async createAutoReply(conv: SupportConversationDocument, text: string) {
    const msg = await this.msgModel.create({
      conversation: conv._id,
      senderRole: 'admin',
      text,
      images: [],
    });
    await this.convModel.updateOne({ _id: conv._id }, { $inc: { userUnread: 1 } });
    return this.shapeMessage(msg);
  }

  private async pageMessages(conversationId: Types.ObjectId, before?: string) {
    const cursor = before ? new Date(before) : null;
    const filter: Record<string, unknown> = { conversation: conversationId };
    if (cursor && !Number.isNaN(cursor.getTime())) {
      filter.createdAt = { $lt: cursor };
    }
    const rows = await this.msgModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(MSG_PAGE + 1);
    const hasMore = rows.length > MSG_PAGE;
    const page = hasMore ? rows.slice(0, MSG_PAGE) : rows;
    return {
      items: page.reverse().map((m) => this.shapeMessage(m)),
      hasMore,
    };
  }

  /** Đẩy sự kiện cho mọi phiên admin đang mở — chỉ MỘT phòng chung, không theo id cụ thể. */
  private async emitToAdmin(event: string, payload: unknown) {
    try {
      this.gateway.emitToUser('root-admin', 'admin', event, payload);
    } catch (err: unknown) {
      this.logger.warn(`Không đẩy được sự kiện CSKH cho admin: ${String(err)}`);
    }
  }

  private shapeMessage(m: SupportMessageDocument) {
    return {
      id: String(m._id),
      conversationId: String(m.conversation),
      senderRole: m.senderRole,
      text: m.text ?? '',
      images: (m.images ?? []).map((i) => ({ url: i.url })),
      readAt: m.readAt,
      createdAt: (m as unknown as { createdAt: Date }).createdAt,
    };
  }

  private shapeForUser(c: SupportConversationDocument) {
    return {
      id: String(c._id),
      peer: SUPPORT_PEER,
      lastMessage: c.lastMessage?.text
        ? {
            text: c.lastMessage.text,
            senderRole: c.lastMessage.senderRole,
            at: c.lastMessage.at,
          }
        : null,
      lastMessageAt: c.lastMessageAt,
      unread: c.userUnread,
      status: c.status,
    };
  }

  /** Gắn tên/liên hệ người dùng cho danh sách phía admin — hỏi một lượt cho cả trang. */
  private async shapeForAdmin(convs: SupportConversationDocument[]) {
    if (convs.length === 0) return [];

    const userIds = [...new Set(convs.map((c) => String(c.user)))].map(
      (id) => new Types.ObjectId(id),
    );
    const [users, profiles, shops] = await Promise.all([
      this.userModel.find({ _id: { $in: userIds } }).select('email phone').lean(),
      this.profileModel
        .find({ user: { $in: userIds } })
        .select('user fullName displayName avatarUrl')
        .lean(),
      this.shopModel
        .find({ owner: { $in: userIds } })
        .select('owner name')
        .lean(),
    ]);
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const profileById = new Map(profiles.map((p) => [String(p.user), p]));
    const shopByOwner = new Map(shops.map((s) => [String(s.owner), s]));

    return convs.map((c) => {
      const uid = String(c.user);
      const u = userById.get(uid);
      const p = profileById.get(uid);
      const shop = c.userRole === 'seller' ? shopByOwner.get(uid) : undefined;
      return {
        id: String(c._id),
        userRole: c.userRole,
        status: c.status,
        user: {
          id: uid,
          name: p?.fullName || p?.displayName || shop?.name || 'Người dùng',
          avatarUrl: p?.avatarUrl,
          contact: u?.email || u?.phone || '(ẩn danh)',
          shopName: shop?.name,
        },
        lastMessage: c.lastMessage?.text
          ? {
              text: c.lastMessage.text,
              senderRole: c.lastMessage.senderRole,
              at: c.lastMessage.at,
            }
          : null,
        lastMessageAt: c.lastMessageAt,
        unread: c.adminUnread,
      };
    });
  }
}
