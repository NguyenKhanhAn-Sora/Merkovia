import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

/** App mà thông báo dành cho — buyer và seller là hai ngữ cảnh tách biệt. */
export const NOTIF_AUDIENCES = ['buyer', 'seller'] as const;
export type NotifAudience = (typeof NOTIF_AUDIENCES)[number];

/**
 * Loại thông báo. Frontend map sang biểu tượng/màu; giữ tập đóng để hai phía
 * không lệch nhau. Thêm loại mới thì thêm ở đây trước.
 */
export const NOTIF_TYPES = [
  // → người mua
  'order_confirmed',
  'order_shipping',
  'order_delivered_auto',
  'order_cancelled_by_seller',
  'delivery_failed',
  'cancel_approved',
  'cancel_rejected',
  'return_approved',
  'return_rejected',
  // → người bán
  'new_order',
  'order_received',
  'buyer_cancelled',
  'cancel_requested',
  'return_requested',
  'review_received',
  'payout_paid',
] as const;
export type NotifType = (typeof NOTIF_TYPES)[number];

/**
 * Thông báo gửi tới MỘT người dùng trong MỘT ngữ cảnh app.
 *
 * `user` + `audience` là khoá phân quyền: mọi truy vấn đọc/đánh dấu/xoá đều lọc
 * theo cả hai, nên không ai chạm được thông báo của người khác, và app người
 * mua không thấy thông báo dành cho vai người bán (kể cả khi cùng một tài khoản
 * vừa mua vừa bán).
 */
@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: String, enum: NOTIF_AUDIENCES, required: true })
  audience: NotifAudience;

  @Prop({ type: String, enum: NOTIF_TYPES, required: true })
  type: NotifType;

  @Prop({ trim: true, required: true, maxlength: 160 })
  title: string;

  @Prop({ trim: true, required: true, maxlength: 400 })
  body: string;

  /** Đường dẫn nội bộ để bấm vào mở đúng trang (vd `/orders/<id>`). */
  @Prop({ trim: true })
  link?: string;

  /** Dữ liệu kèm để hiển thị/điều hướng — không dùng để phân quyền. */
  @Prop({ type: Object })
  data?: Record<string, unknown>;

  @Prop({ default: false, index: true })
  read: boolean;

  @Prop()
  readAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Danh sách: luôn lọc theo người nhận + ngữ cảnh rồi sắp mới-nhất-trước.
NotificationSchema.index({ user: 1, audience: 1, createdAt: -1 });
// Đếm chưa đọc nhanh cho chuông thông báo.
NotificationSchema.index({ user: 1, audience: 1, read: 1 });
