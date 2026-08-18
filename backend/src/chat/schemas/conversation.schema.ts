import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;

/** Ai gửi — theo VAI, không theo user id. */
export const CHAT_ROLES = ['buyer', 'seller'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

/** Bản tóm tắt tin cuối, nhúng sẵn để danh sách hội thoại không phải join. */
@Schema({ _id: false })
export class LastMessage {
  @Prop({ trim: true, default: '' })
  text: string;

  @Prop({ type: String, enum: CHAT_ROLES })
  senderRole?: ChatRole;

  @Prop()
  at?: Date;
}
const LastMessageSchema = SchemaFactory.createForClass(LastMessage);

/**
 * Một cuộc trò chuyện giữa MỘT người mua và MỘT gian hàng.
 *
 * Bên bán là SHOP chứ không phải user: chủ shop có thể đổi, và cùng một người
 * vừa mua vừa bán thì hai vai phải tách bạch. Khoá duy nhất `{buyer, shop}` bảo
 * đảm không bao giờ có hai hội thoại trùng cho cùng một cặp.
 */
@Schema({ timestamps: true })
export class Conversation {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  buyer: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true,
  })
  shop: Types.ObjectId;

  @Prop({ type: LastMessageSchema, default: () => ({}) })
  lastMessage: LastMessage;

  /**
   * Mốc sắp xếp danh sách. Tách khỏi `lastMessage.at` để luôn có giá trị (hội
   * thoại vừa tạo chưa có tin nào vẫn phải đứng đúng chỗ).
   */
  @Prop({ default: () => new Date(), index: true })
  lastMessageAt: Date;

  /** Số tin người mua chưa đọc (do shop gửi). */
  @Prop({ default: 0, min: 0 })
  buyerUnread: number;

  /** Số tin gian hàng chưa đọc (do người mua gửi). */
  @Prop({ default: 0, min: 0 })
  sellerUnread: number;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// 🔴 Chặn tạo trùng khi bấm "Nhắn tin" hai lần cùng lúc.
ConversationSchema.index({ buyer: 1, shop: 1 }, { unique: true });
// Danh sách của mỗi phía, mới nhất trước.
ConversationSchema.index({ buyer: 1, lastMessageAt: -1 });
ConversationSchema.index({ shop: 1, lastMessageAt: -1 });
