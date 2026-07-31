import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Conversation,
  ConversationDocument,
  type ChatRole,
} from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { Profile, ProfileDocument } from '../profiles/schemas/profile.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/** Ảnh đính kèm khi gửi (đã upload). */
interface OutgoingImage {
  url: string;
  key?: string;
}

const CONV_PAGE = 20;
const MSG_PAGE = 30;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectModel(Conversation.name)
    private readonly convModel: Model<ConversationDocument>,
    @InjectModel(Message.name)
    private readonly msgModel: Model<MessageDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly gateway: RealtimeGateway,
  ) {}

  /* ----------------------------- Danh tính ------------------------------ */

  /** Gian hàng của người bán đang đăng nhập. */
  private async requireShop(user: UserDocument): Promise<ShopDocument> {
    const shop = await this.shopModel.findOne({ owner: user._id });
    if (!shop) throw new ForbiddenException('Tài khoản chưa có gian hàng.');
    return shop;
  }

  /**
   * Điều kiện lọc "hội thoại của tôi" theo vai.
   *
   * 🔴 Mọi truy vấn đọc/ghi đều phải đi qua đây: đó là thứ duy nhất bảo đảm
   * không ai đọc được hội thoại của người khác, và app người mua không chạm
   * được vai người bán (kể cả khi cùng một tài khoản vừa mua vừa bán).
   */
  private async scopeFilter(
    user: UserDocument,
    role: ChatRole,
  ): Promise<Record<string, unknown>> {
    if (role === 'seller') {
      const shop = await this.requireShop(user);
      return { shop: shop._id };
    }
    return { buyer: user._id };
  }

  private async requireConversation(
    user: UserDocument,
    role: ChatRole,
    id: string,
  ): Promise<ConversationDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy cuộc trò chuyện.');
    }
    const filter = await this.scopeFilter(user, role);
    const conv = await this.convModel.findOne({ _id: id, ...filter });
    if (!conv) throw new NotFoundException('Không tìm thấy cuộc trò chuyện.');
    return conv;
  }

  /* ------------------------------ Mở chat ------------------------------- */

  /**
   * Lấy hội thoại đang có, hoặc tạo mới — dùng cho nút "Nhắn tin".
   *
   * 🔴 `findOneAndUpdate` + upsert thay vì "tìm rồi tạo": bấm hai lần liên tiếp
   * (hoặc mở hai tab) sẽ chạy song song, kiểm-rồi-ghi luôn có khe hở và tạo ra
   * hai hội thoại cho cùng một cặp. Khoá duy nhất `{buyer, shop}` chốt lần cuối.
   */
  async open(
    user: UserDocument,
    role: ChatRole,
    target: { shopId?: string; buyerId?: string },
  ) {
    let buyerId: Types.ObjectId;
    let shopId: Types.ObjectId;

    if (role === 'buyer') {
      if (!target.shopId || !Types.ObjectId.isValid(target.shopId)) {
        throw new BadRequestException('Thiếu gian hàng cần nhắn tin.');
      }
      const shop = await this.shopModel.findById(target.shopId).select('owner');
      if (!shop) throw new NotFoundException('Không tìm thấy gian hàng.');
      // Chủ shop tự nhắn cho chính gian hàng mình là hội thoại vô nghĩa.
      if (String(shop.owner) === String(user._id)) {
        throw new BadRequestException(
          'Đây là gian hàng của bạn, không thể tự nhắn tin.',
        );
      }
      buyerId = user._id as Types.ObjectId;
      shopId = shop._id as Types.ObjectId;
    } else {
      if (!target.buyerId || !Types.ObjectId.isValid(target.buyerId)) {
        throw new BadRequestException('Thiếu người mua cần nhắn tin.');
      }
      const shop = await this.requireShop(user);
      if (String(shop.owner) === String(target.buyerId)) {
        throw new BadRequestException('Không thể tự nhắn tin cho chính mình.');
      }
      buyerId = new Types.ObjectId(target.buyerId);
      shopId = shop._id as Types.ObjectId;
    }

    const conv = await this.convModel.findOneAndUpdate(
      { buyer: buyerId, shop: shopId },
      { $setOnInsert: { buyer: buyerId, shop: shopId, lastMessageAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const [shaped] = await this.shapeConversations([conv], role);
    return { conversation: shaped };
  }

  /* ------------------------------ Danh sách ----------------------------- */

  async list(user: UserDocument, role: ChatRole, page = 1) {
    const p = Math.max(1, page);
    const filter = await this.scopeFilter(user, role);
    const [items, total] = await Promise.all([
      this.convModel
        .find(filter)
        .sort({ lastMessageAt: -1 })
        .skip((p - 1) * CONV_PAGE)
        .limit(CONV_PAGE),
      this.convModel.countDocuments(filter),
    ]);
    return {
      items: await this.shapeConversations(items, role),
      total,
      page: p,
      limit: CONV_PAGE,
    };
  }

  /** Tổng số tin chưa đọc — cho badge trên thanh điều hướng. */
  async unreadTotal(user: UserDocument, role: ChatRole) {
    const filter = await this.scopeFilter(user, role);
    const field = role === 'buyer' ? '$buyerUnread' : '$sellerUnread';
    const rows = await this.convModel.aggregate<{ total: number }>([
      { $match: filter },
      { $group: { _id: null, total: { $sum: field } } },
    ]);
    return { unread: rows[0]?.total ?? 0 };
  }

  /* ------------------------------ Tin nhắn ------------------------------ */

  /**
   * Tải tin theo trang bằng CON TRỎ thời gian (`before`), không dùng skip:
   * hội thoại dài mà skip sâu thì Mongo phải đếm qua toàn bộ, và tin mới đến
   * giữa chừng sẽ làm lệch trang.
   */
  async messages(
    user: UserDocument,
    role: ChatRole,
    convId: string,
    before?: string,
  ) {
    const conv = await this.requireConversation(user, role, convId);
    const cursor = before ? new Date(before) : null;
    const filter: Record<string, unknown> = { conversation: conv._id };
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
      // Trả về theo thứ tự CŨ → MỚI cho giao diện đổ thẳng vào khung chat.
      items: page.reverse().map((m) => this.shapeMessage(m)),
      hasMore,
    };
  }

  async send(
    user: UserDocument,
    role: ChatRole,
    convId: string,
    payload: { text?: string; images?: OutgoingImage[] },
  ) {
    const conv = await this.requireConversation(user, role, convId);
    const body = payload.text?.trim() ?? '';
    const images = (payload.images ?? []).filter((i) => i?.url);
    // Phải có ít nhất VĂN BẢN hoặc ẢNH — tin rỗng hoàn toàn là vô nghĩa.
    if (!body && images.length === 0) {
      throw new BadRequestException('Nội dung tin nhắn trống.');
    }

    const msg = await this.msgModel.create({
      conversation: conv._id,
      senderRole: role,
      sender: user._id,
      text: body || undefined,
      images: images.map((i) => ({ url: i.url, key: i.key })),
    });

    const now = new Date();
    // Tóm tắt cho danh sách: chỉ-ảnh thì hiện nhãn thay vì chuỗi rỗng.
    const preview = body || (images.length ? '[Hình ảnh]' : '');
    await this.convModel.updateOne(
      { _id: conv._id },
      {
        $set: {
          lastMessage: { text: preview, senderRole: role, at: now },
          lastMessageAt: now,
        },
        $inc: role === 'buyer' ? { sellerUnread: 1 } : { buyerUnread: 1 },
      },
    );

    await this.broadcast(conv, this.shapeMessage(msg));
    return { message: this.shapeMessage(msg) };
  }

  /** Báo phía bên kia "đang gõ…" — sự kiện thoáng qua, không lưu DB. */
  async notifyTyping(user: UserDocument, role: ChatRole, convId: string) {
    const conv = await this.requireConversation(user, role, convId);
    const otherRole: ChatRole = role === 'buyer' ? 'seller' : 'buyer';
    await this.emitTo(conv, otherRole, 'chat:typing', {
      conversationId: String(conv._id),
    });
    return { ok: true };
  }

  /** Đánh dấu đã đọc phía mình + báo bên kia để hiện "Đã xem". */
  async markRead(user: UserDocument, role: ChatRole, convId: string) {
    const conv = await this.requireConversation(user, role, convId);
    const otherRole: ChatRole = role === 'buyer' ? 'seller' : 'buyer';

    await Promise.all([
      this.convModel.updateOne(
        { _id: conv._id },
        { $set: role === 'buyer' ? { buyerUnread: 0 } : { sellerUnread: 0 } },
      ),
      this.msgModel.updateMany(
        { conversation: conv._id, senderRole: otherRole, readAt: null },
        { $set: { readAt: new Date() } },
      ),
    ]);

    await this.emitTo(conv, otherRole, 'chat:read', {
      conversationId: String(conv._id),
    });
    return { ok: true };
  }

  /* ------------------------------- Nội bộ ------------------------------- */

  /** Đẩy tin mới cho CẢ HAI phía: người nhận, và các thiết bị khác của người gửi. */
  private async broadcast(conv: ConversationDocument, message: unknown) {
    const payload = { conversationId: String(conv._id), message };
    await Promise.all([
      this.emitTo(conv, 'buyer', 'chat:message', payload),
      this.emitTo(conv, 'seller', 'chat:message', payload),
    ]);
  }

  /** Gửi sự kiện tới một VAI của hội thoại (tra chủ shop nếu là vai bán). */
  private async emitTo(
    conv: ConversationDocument,
    role: ChatRole,
    event: string,
    payload: unknown,
  ) {
    try {
      if (role === 'buyer') {
        this.gateway.emitToUser(String(conv.buyer), 'buyer', event, payload);
        return;
      }
      const shop = await this.shopModel.findById(conv.shop).select('owner').lean();
      if (shop?.owner) {
        this.gateway.emitToUser(String(shop.owner), 'seller', event, payload);
      }
    } catch (err: unknown) {
      // Real-time hỏng không được làm hỏng việc gửi tin (tin đã nằm trong DB).
      this.logger.warn(`Không đẩy được sự kiện chat: ${String(err)}`);
    }
  }

  private shapeMessage(m: MessageDocument) {
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

  /**
   * Gắn thông tin ĐỐI PHƯƠNG cho danh sách hội thoại — hỏi shop/hồ sơ MỘT lượt
   * cho cả trang thay vì mỗi hội thoại một truy vấn.
   */
  private async shapeConversations(
    convs: ConversationDocument[],
    role: ChatRole,
  ) {
    if (convs.length === 0) return [];

    if (role === 'buyer') {
      const ids = [...new Set(convs.map((c) => String(c.shop)))].map(
        (id) => new Types.ObjectId(id),
      );
      const shops = await this.shopModel
        .find({ _id: { $in: ids } })
        .select('name slug logoUrl owner')
        .lean();
      const byId = new Map(shops.map((s) => [String(s._id), s]));
      // Trạng thái hoạt động của ĐỐI PHƯƠNG = chủ shop (app người bán).
      const activeBy = await this.lastActiveMap(
        shops.map((s) => String(s.owner)),
      );
      return convs.map((c) => {
        const s = byId.get(String(c.shop));
        const owner = s ? String(s.owner) : '';
        return {
          ...this.baseConversation(c, role),
          peer: {
            id: String(c.shop),
            name: s?.name ?? 'Gian hàng',
            slug: s?.slug,
            avatarUrl: s?.logoUrl,
            online: owner ? this.gateway.isOnline(owner, 'seller') : false,
            lastActiveAt: activeBy.get(owner),
          },
        };
      });
    }

    const ids = [...new Set(convs.map((c) => String(c.buyer)))].map(
      (id) => new Types.ObjectId(id),
    );
    const [profiles, activeBy] = await Promise.all([
      this.profileModel
        .find({ user: { $in: ids } })
        .select('user fullName displayName avatarUrl')
        .lean(),
      this.lastActiveMap(convs.map((c) => String(c.buyer))),
    ]);
    const byUser = new Map(profiles.map((p) => [String(p.user), p]));
    return convs.map((c) => {
      const buyerId = String(c.buyer);
      const p = byUser.get(buyerId);
      return {
        ...this.baseConversation(c, role),
        peer: {
          id: buyerId,
          name: p?.fullName || p?.displayName || 'Người mua',
          avatarUrl: p?.avatarUrl,
          online: this.gateway.isOnline(buyerId, 'buyer'),
          lastActiveAt: activeBy.get(buyerId),
        },
      };
    });
  }

  /** Bản đồ userId → lastActiveAt cho một loạt người (một truy vấn). */
  private async lastActiveMap(
    userIds: string[],
  ): Promise<Map<string, Date | undefined>> {
    const ids = [...new Set(userIds.filter(Boolean))].map(
      (id) => new Types.ObjectId(id),
    );
    if (ids.length === 0) return new Map();
    const users = await this.userModel
      .find({ _id: { $in: ids } })
      .select('lastActiveAt')
      .lean();
    return new Map(users.map((u) => [String(u._id), u.lastActiveAt]));
  }

  private baseConversation(c: ConversationDocument, role: ChatRole) {
    return {
      id: String(c._id),
      lastMessage: c.lastMessage?.text
        ? {
            text: c.lastMessage.text,
            senderRole: c.lastMessage.senderRole,
            at: c.lastMessage.at,
          }
        : null,
      lastMessageAt: c.lastMessageAt,
      unread: role === 'buyer' ? c.buyerUnread : c.sellerUnread,
    };
  }
}
