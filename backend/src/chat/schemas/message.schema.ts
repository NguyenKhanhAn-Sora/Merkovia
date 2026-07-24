import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CHAT_ROLES, type ChatRole } from './conversation.schema';

export type MessageDocument = HydratedDocument<Message>;

/** Giới hạn độ dài một tin — đủ cho hội thoại mua bán, chặn spam khối lớn. */
export const MAX_MESSAGE_LENGTH = 2000;

/**
 * Một tin nhắn văn bản trong hội thoại.
 *
 * Phiên bản này CHỈ có văn bản (chưa ảnh/sticker/emoji picker). `senderRole`
 * quyết định cách hiển thị (trái/phải); `sender` giữ lại user thật để truy vết
 * khi shop đổi chủ.
 */
@Schema({ timestamps: true })
export class Message {
  @Prop({
    type: Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  })
  conversation: Types.ObjectId;

  @Prop({ type: String, enum: CHAT_ROLES, required: true })
  senderRole: ChatRole;

  /** User thật đã gửi (người mua, hoặc chủ shop tại thời điểm gửi). */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sender: Types.ObjectId;

  @Prop({
    trim: true,
    required: true,
    maxlength: MAX_MESSAGE_LENGTH,
  })
  text: string;

  /** Thời điểm phía bên kia đọc — để hiện "Đã xem". */
  @Prop()
  readAt?: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Tải tin theo hội thoại, mới nhất trước (phân trang bằng con trỏ createdAt).
MessageSchema.index({ conversation: 1, createdAt: -1 });
