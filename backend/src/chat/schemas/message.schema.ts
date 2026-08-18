import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { CHAT_ROLES, type ChatRole } from './conversation.schema';

export type MessageDocument = HydratedDocument<Message>;

/** Giới hạn độ dài một tin — đủ cho hội thoại mua bán, chặn spam khối lớn. */
export const MAX_MESSAGE_LENGTH = 2000;

/** Ảnh đính kèm — trỏ file đã upload lên R2. */
@Schema({ _id: false })
export class ChatImage {
  @Prop({ required: true })
  url: string;

  /** Khoá R2 để xoá được khi thu hồi tin (giữ chỗ cho tính năng sau). */
  @Prop()
  key?: string;
}
const ChatImageSchema = SchemaFactory.createForClass(ChatImage);

/** Tối đa ảnh mỗi tin — gọn khung chat, chặn spam. */
export const MAX_MESSAGE_IMAGES = 6;

/**
 * Một tin nhắn trong hội thoại: văn bản và/hoặc ẢNH (ít nhất một trong hai).
 * `senderRole` quyết định cách hiển thị (trái/phải); `sender` giữ lại user thật
 * để truy vết khi shop đổi chủ.
 */
@Schema({ timestamps: true })
export class Message {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  })
  conversation: Types.ObjectId;

  @Prop({ type: String, enum: CHAT_ROLES, required: true })
  senderRole: ChatRole;

  /** User thật đã gửi (người mua, hoặc chủ shop tại thời điểm gửi). */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  sender: Types.ObjectId;

  /** Văn bản — KHÔNG bắt buộc vì tin có thể chỉ gồm ảnh. */
  @Prop({ trim: true, maxlength: MAX_MESSAGE_LENGTH })
  text?: string;

  @Prop({ type: [ChatImageSchema], default: [] })
  images: ChatImage[];

  /** Thời điểm phía bên kia đọc — để hiện "Đã xem". */
  @Prop()
  readAt?: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Tải tin theo hội thoại, mới nhất trước (phân trang bằng con trỏ createdAt).
MessageSchema.index({ conversation: 1, createdAt: -1 });
