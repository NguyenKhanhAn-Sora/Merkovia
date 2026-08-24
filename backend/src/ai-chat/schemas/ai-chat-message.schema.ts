import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import type { AppScope } from '../../common/auth-scope';

export type AiChatMessageDocument = HydratedDocument<AiChatMessage>;

export const AI_CHAT_ROLES = ['user', 'model'] as const;
export type AiChatRole = (typeof AI_CHAT_ROLES)[number];

/** Độ dài tối đa một tin — đủ cho câu hỏi/trả lời, chặn spam khối lớn. */
export const MAX_AI_CHAT_MESSAGE_LENGTH = 4000;

@Schema({ _id: false })
export class AiChatProductCardDeal {
  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  endsAt: Date;
}
const AiChatProductCardDealSchema = SchemaFactory.createForClass(AiChatProductCardDeal);

@Schema({ _id: false })
export class AiChatProductCardShop {
  @Prop()
  name?: string;

  @Prop()
  slug?: string;

  @Prop()
  logoUrl?: string;
}
const AiChatProductCardShopSchema = SchemaFactory.createForClass(AiChatProductCardShop);

/**
 * Sản phẩm bot tìm/tra được để hiển thị dạng thẻ (card) ngay trong hội thoại
 * thay vì chỉ nhắc bằng chữ — bấm vào đi thẳng tới trang sản phẩm. Cố tình
 * khớp NGUYÊN hình dạng `ProductCardData` phía frontend để tái dùng thẳng
 * component `ProductCard` sẵn có (đúng hệt ô sản phẩm ở trang chủ/tìm kiếm),
 * không phải dựng thẻ rút gọn riêng. Chụp lại ngay lúc trả lời (không join
 * động khi hiển thị) để lịch sử cũ vẫn hiện đúng dữ liệu tại thời điểm đó dù
 * giá/tồn kho sau này đổi.
 */
@Schema({ _id: false })
export class AiChatProductCard {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  slug: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  image?: string;

  @Prop({ required: true })
  priceMin: number;

  @Prop({ required: true })
  priceMax: number;

  @Prop({ type: AiChatProductCardDealSchema })
  deal?: AiChatProductCardDeal;

  @Prop({ default: true })
  inStock: boolean;

  @Prop({ default: 0 })
  ratingAvg: number;

  @Prop({ default: 0 })
  ratingCount: number;

  @Prop({ default: 0 })
  sold: number;

  @Prop({ type: AiChatProductCardShopSchema, required: true })
  shop: AiChatProductCardShop;
}
const AiChatProductCardSchema = SchemaFactory.createForClass(AiChatProductCard);

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

  /** Chỉ có ở tin của bot (`role: 'model'`) khi có gọi tool tra sản phẩm. */
  @Prop({ type: [AiChatProductCardSchema], default: [] })
  products: AiChatProductCard[];
}

export const AiChatMessageSchema = SchemaFactory.createForClass(AiChatMessage);

// Tải lịch sử theo user+scope, cũ→mới (làm ngữ cảnh gửi cho Gemini) hoặc
// mới→cũ (hiển thị) — cùng một index dùng được cho cả hai chiều sort.
AiChatMessageSchema.index({ user: 1, scope: 1, createdAt: 1 });
