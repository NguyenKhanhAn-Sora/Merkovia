import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type SupportConversationDocument = HydratedDocument<SupportConversation>;

/** Ai gửi — chỉ hai phía: người dùng (buyer/seller) và đội CSKH. */
export const SUPPORT_SENDER_ROLES = ['user', 'admin'] as const;
export type SupportSenderRole = (typeof SUPPORT_SENDER_ROLES)[number];

/** App mà cuộc trò chuyện được mở từ đó — quyết định hiện ở đâu, không đổi. */
export const SUPPORT_USER_ROLES = ['buyer', 'seller'] as const;
export type SupportUserRole = (typeof SUPPORT_USER_ROLES)[number];

export const SUPPORT_STATUS = ['open', 'closed'] as const;
export type SupportStatus = (typeof SUPPORT_STATUS)[number];

@Schema({ _id: false })
export class SupportLastMessage {
  @Prop({ trim: true, default: '' })
  text: string;

  @Prop({ type: String, enum: SUPPORT_SENDER_ROLES })
  senderRole?: SupportSenderRole;

  @Prop()
  at?: Date;
}
const SupportLastMessageSchema = SchemaFactory.createForClass(SupportLastMessage);

/**
 * Hội thoại hỗ trợ (CSKH) của MỘT người dùng với ĐỘI NGŨ ADMIN — không phải
 * một shop cụ thể như `chat/Conversation`.
 *
 * 🔴 Admin trong dự án này CHỈ CÓ MỘT tài khoản gốc cấu hình qua `.env`
 * (`AdminAuthService`: `sub` luôn là `'root-admin'`, không có bản ghi `User`
 * nào cho admin) — nên không cần khái niệm "ai đang trực" hay gán người phụ
 * trách. Mọi cuộc trò chuyện đổ chung vào MỘT hộp thư "Merkovia Support" mà
 * admin nào đăng nhập cũng thấy và trả lời được, y hệt mô hình CSKH thật của
 * hầu hết sàn TMĐT (khách thấy "Đội hỗ trợ", không thấy tên nhân viên cụ thể).
 *
 * `{user, userRole}` là duy nhất: một người vừa mua vừa bán có HAI cuộc trò
 * chuyện CSKH tách biệt (bối cảnh câu hỏi ở hai app khác hẳn nhau), giống
 * cách buyer/seller đã tách phiên đăng nhập trong toàn hệ thống.
 */
@Schema({ timestamps: true })
export class SupportConversation {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  user: Types.ObjectId;

  @Prop({ type: String, enum: SUPPORT_USER_ROLES, required: true })
  userRole: SupportUserRole;

  @Prop({ type: SupportLastMessageSchema, default: () => ({}) })
  lastMessage: SupportLastMessage;

  @Prop({ default: () => new Date(), index: true })
  lastMessageAt: Date;

  /** Số tin người dùng chưa đọc (do admin gửi). */
  @Prop({ default: 0, min: 0 })
  userUnread: number;

  /** Số tin admin chưa đọc (do người dùng gửi). */
  @Prop({ default: 0, min: 0 })
  adminUnread: number;

  /**
   * `open` = còn cần xử lý, `closed` = admin đánh dấu đã giải quyết. Chỉ để
   * ẩn bớt danh sách phía admin — người dùng nhắn lại vào hội thoại đã đóng
   * thì tự động mở lại (xem `SupportChatService.sendAsUser`).
   */
  @Prop({ type: String, enum: SUPPORT_STATUS, default: 'open', index: true })
  status: SupportStatus;
}
export const SupportConversationSchema = SchemaFactory.createForClass(
  SupportConversation,
);

SupportConversationSchema.index({ user: 1, userRole: 1 }, { unique: true });
SupportConversationSchema.index({ status: 1, lastMessageAt: -1 });

export type SupportMessageDocument = HydratedDocument<SupportMessage>;

@Schema({ _id: false })
export class SupportImage {
  @Prop({ required: true })
  url: string;

  @Prop()
  key?: string;
}
const SupportImageSchema = SchemaFactory.createForClass(SupportImage);

/** Giới hạn giống chat mua-bán — cùng một loại trải nghiệm, không lý do khác nhau. */
export const SUPPORT_MAX_MESSAGE_LENGTH = 2000;
export const SUPPORT_MAX_IMAGES = 6;

/**
 * Một tin trong hội thoại CSKH. KHÔNG có field `sender` riêng như
 * `chat/Message`: bên `user` luôn chính là `conversation.user` (hội thoại
 * không có khái niệm đổi chủ như shop), còn bên `admin` chỉ có một tài khoản
 * duy nhất nên không cần biết "admin nào" đã gửi.
 */
@Schema({ timestamps: true })
export class SupportMessage {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'SupportConversation',
    required: true,
    index: true,
  })
  conversation: Types.ObjectId;

  @Prop({ type: String, enum: SUPPORT_SENDER_ROLES, required: true })
  senderRole: SupportSenderRole;

  @Prop({ trim: true, maxlength: SUPPORT_MAX_MESSAGE_LENGTH })
  text?: string;

  @Prop({ type: [SupportImageSchema], default: [] })
  images: SupportImage[];

  @Prop()
  readAt?: Date;
}
export const SupportMessageSchema = SchemaFactory.createForClass(SupportMessage);

SupportMessageSchema.index({ conversation: 1, createdAt: -1 });
