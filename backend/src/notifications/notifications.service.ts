import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotifAudience,
  NotifType,
} from './schemas/notification.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { UserDocument } from '../users/schemas/user.schema';

/** Nội dung một thông báo, chưa gắn người nhận. */
export interface NotifyPayload {
  type: NotifType;
  title: string;
  body: string;
  link?: string;
  data?: Record<string, unknown>;
}

const PAGE_SIZE = 20;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly model: Model<NotificationDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    private readonly gateway: RealtimeGateway,
  ) {}

  /* ------------------------------- Tạo ---------------------------------- */

  /**
   * Gửi thông báo tới một người dùng trong một app.
   *
   * 🔴 KHÔNG BAO GIỜ ném lỗi ra ngoài: mọi nơi gọi hàm này đều đang ở giữa một
   * nghiệp vụ đã thành công (đơn đã chuyển trạng thái, đánh giá đã lưu…). Thông
   * báo chỉ là phần thêm — hỏng nó không được phép làm nghiệp vụ chính báo lỗi.
   */
  async notifyUser(
    userId: Types.ObjectId | string,
    audience: NotifAudience,
    payload: NotifyPayload,
  ): Promise<void> {
    try {
      const doc = await this.model.create({
        user: new Types.ObjectId(String(userId)),
        audience,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        link: payload.link,
        data: payload.data,
        read: false,
      });
      // Đẩy real-time (nếu người dùng đang mở app). Không mở thì họ vẫn thấy khi
      // tải lại — bản ghi đã nằm trong DB.
      this.gateway.emitToUser(
        String(userId),
        audience,
        'notification:new',
        this.shape(doc),
      );
    } catch (err: unknown) {
      this.logger.warn(`Không tạo được thông báo: ${String(err)}`);
    }
  }

  /**
   * Gửi thông báo tới CHỦ một gian hàng (audience seller).
   * Tự tra chủ shop để nơi gọi không phải mang sẵn userId của người bán.
   */
  async notifyShop(
    shopId: Types.ObjectId | string,
    payload: NotifyPayload,
  ): Promise<void> {
    try {
      const shop = await this.shopModel
        .findById(shopId)
        .select('owner')
        .lean();
      if (!shop?.owner) return;
      await this.notifyUser(shop.owner, 'seller', payload);
    } catch (err: unknown) {
      this.logger.warn(`Không gửi được thông báo cho shop: ${String(err)}`);
    }
  }

  /* ------------------------------ Truy vấn ------------------------------ */

  async list(user: UserDocument, audience: NotifAudience, page = 1) {
    const p = Math.max(1, page);
    const filter = { user: user._id, audience };
    const [items, total, unread] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((p - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE),
      this.model.countDocuments(filter),
      this.model.countDocuments({ ...filter, read: false }),
    ]);
    return {
      items: items.map((n) => this.shape(n)),
      total,
      unread,
      page: p,
      limit: PAGE_SIZE,
    };
  }

  async unreadCount(user: UserDocument, audience: NotifAudience) {
    const unread = await this.model.countDocuments({
      user: user._id,
      audience,
      read: false,
    });
    return { unread };
  }

  /**
   * Đánh dấu đã đọc. `all=true` đọc hết; ngược lại chỉ những `ids` được gửi.
   * Luôn kèm `user`+`audience` trong điều kiện nên không đọc nhầm của người khác.
   */
  async markRead(
    user: UserDocument,
    audience: NotifAudience,
    opts: { ids?: string[]; all?: boolean },
  ) {
    const base = { user: user._id, audience, read: false };
    const filter = opts.all
      ? base
      : { ...base, _id: { $in: this.validIds(opts.ids) } };
    await this.model.updateMany(filter, {
      $set: { read: true, readAt: new Date() },
    });
    return this.unreadCount(user, audience);
  }

  /** Xoá thông báo (một hoặc nhiều, hoặc tất cả). */
  async remove(
    user: UserDocument,
    audience: NotifAudience,
    opts: { ids?: string[]; all?: boolean },
  ) {
    const base = { user: user._id, audience };
    const filter = opts.all
      ? base
      : { ...base, _id: { $in: this.validIds(opts.ids) } };
    const res = await this.model.deleteMany(filter);
    const unread = await this.unreadCount(user, audience);
    return { deleted: res.deletedCount ?? 0, unread: unread.unread };
  }

  /* ------------------------------ Nội bộ ------------------------------- */

  private validIds(ids?: string[]): Types.ObjectId[] {
    return (ids ?? [])
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
  }

  private shape(n: NotificationDocument) {
    return {
      id: String(n._id),
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      data: n.data,
      read: n.read,
      createdAt: (n as unknown as { createdAt: Date }).createdAt,
    };
  }
}
