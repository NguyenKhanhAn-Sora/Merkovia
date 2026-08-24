import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import type { AppScope } from '../../common/auth-scope';

export type AiChatMessageDocument = HydratedDocument<AiChatMessage>;

export const AI_CHAT_ROLES = ['user', 'model'] as const;
export type AiChatRole = (typeof AI_CHAT_ROLES)[number];

/** Độ dài tối đa một tin — đủ cho câu hỏi/trả lời, chặn spam khối lớn. */
export const MAX_AI_CHAT_MESSAGE_LENGTH = 4000;

/**
 * Một tin trong hội thoại với trợ lý AI. Không có khái niệm "phiên" riêng —
 * mỗi cặp (user, scope) chỉ có MỘT hội thoại liên tục (giống lịch sử chat của
 * một người với một trợ lý), đơn giản hơn `Conversation` của chat buyer↔shop
 * vốn cần nhiều hội thoại song song theo từng shop.
 */
@Schema({ timestamps: true })
export class AiChatMessage {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  /**
   * Buyer và seller là hai "nhân cách" khác nhau của trợ lý (khác bộ tool,
   * khác phạm vi dữ liệu) — tách lịch sử theo scope để không lẫn ngữ cảnh.
   */
  @Prop({ type: String, required: true })
  scope: AppScope;

  @Prop({ type: String, enum: AI_CHAT_ROLES, required: true })
  role: AiChatRole;

  @Prop({ trim: true, required: true, maxlength: MAX_AI_CHAT_MESSAGE_LENGTH })
  text: string;
}

export const AiChatMessageSchema = SchemaFactory.createForClass(AiChatMessage);

// Tải lịch sử theo user+scope, cũ→mới (làm ngữ cảnh gửi cho Gemini) hoặc
// mới→cũ (hiển thị) — cùng một index dùng được cho cả hai chiều sort.
AiChatMessageSchema.index({ user: 1, scope: 1, createdAt: 1 });
