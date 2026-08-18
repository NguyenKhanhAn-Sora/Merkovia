import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

export const MEDIA_KINDS = ['image', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Tối đa mỗi đánh giá — đủ khoe hàng, không thành kho ảnh. */
export const MAX_MEDIA = 6;
export const MAX_COMMENT = 1000;

/** Một tệp đính kèm trong đánh giá. */
@Schema({ _id: false })
export class ReviewMedia {
  @Prop({ type: String, enum: MEDIA_KINDS, required: true })
  kind: MediaKind;

  @Prop({ required: true, trim: true })
  url: string;

  /**
   * Khoá object trên R2. Giữ lại để còn dọn được file khi người dùng xoá đánh
   * giá — không có nó thì mỗi lần sửa là một file rác nằm lại vĩnh viễn.
   */
  @Prop({ trim: true })
  key?: string;
}
const ReviewMediaSchema = SchemaFactory.createForClass(ReviewMedia);

/**
 * Đánh giá sản phẩm sau khi mua.
 *
 * 🔴 Chỉ viết được từ một DÒNG HÀNG trong đơn ĐÃ GIAO của chính mình. Ràng buộc
 * này là thứ phân biệt đánh giá thật với bình luận rác: người viết chắc chắn đã
 * trả tiền và đã nhận hàng.
 *
 * Chụp lại `shop`, `variantLabel`, `orderCode` ngay lúc viết thay vì join lại
 * sau: người bán có thể đổi tên biến thể hoặc gỡ sản phẩm, còn đánh giá thì
 * phải giữ nguyên bối cảnh lúc mua.
 */
@Schema({ timestamps: true })
export class Review {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  buyer: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true,
  })
  product: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true,
  })
  shop: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Order', required: true })
  order: Types.ObjectId;

  /** Biến thể đã mua — "size M màu đen" giúp người đọc hiểu bối cảnh. */
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  variant: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  variantLabel: string;

  @Prop({ min: 1, max: 5, required: true })
  rating: number;

  @Prop({ trim: true, maxlength: MAX_COMMENT, default: '' })
  comment: string;

  @Prop({ type: [ReviewMediaSchema], default: [] })
  media: ReviewMedia[];

  /** Người mua ẩn danh: hiện "Ngu***An" thay vì tên đầy đủ. */
  @Prop({ default: false })
  anonymous: boolean;

  /* --------------------------- Phản hồi của shop -------------------------- */

  @Prop({ trim: true, maxlength: MAX_COMMENT })
  reply?: string;

  /** Lần đầu phản hồi — KHÔNG đổi khi shop sửa lại phản hồi sau đó. */
  @Prop()
  repliedAt?: Date;

  /** Lần gần nhất shop sửa phản hồi — có giá trị thì UI hiện "(đã chỉnh sửa)". */
  @Prop()
  replyEditedAt?: Date;

  /**
   * Đã sửa hay chưa. Cho sửa MỘT lần trong thời hạn ngắn để chữa lỗi gõ, nhưng
   * phải nói rõ là đã sửa — nếu không thì người bán làm hài lòng khách xong,
   * khách lặng lẽ đổi 1 sao thành 5 sao, con số mất hết ý nghĩa.
   */
  @Prop({ default: false })
  edited: boolean;

  /* --------------------------- Kiểm duyệt (admin) ------------------------- */

  /**
   * Admin ẩn toàn bộ đánh giá (rating + comment + media) khỏi trang sản phẩm
   * và khỏi điểm sao trung bình — dùng cho đánh giá spam/vi phạm chính sách.
   * Không xoá: giữ nguyên bằng chứng, và có thể gỡ ẩn lại nếu admin xét nhầm.
   * KHÔNG tự gỡ khi buyer sửa đánh giá — giống đình chỉ shop, chỉ admin mới
   * đảo trạng thái, tránh việc chỉnh sửa vô hiệu hoá quyết định kiểm duyệt.
   */
  @Prop({ default: false, index: true })
  hidden: boolean;

  @Prop()
  hiddenAt?: Date;

  /** Email admin đã ẩn — admin không có collection riêng, xem `AdminPrincipal`. */
  @Prop({ trim: true })
  hiddenBy?: string;

  @Prop({ trim: true, maxlength: 300 })
  hiddenReason?: string;

  /**
   * Admin ẩn riêng PHẦN PHẢN HỒI của shop (không đụng tới đánh giá của
   * buyer) — dùng khi chính phản hồi mới là thứ vi phạm (ví dụ shop trả đũa
   * buyer trong phần trả lời), để không phạt oan đánh giá thật của buyer.
   */
  @Prop({ default: false })
  replyHidden: boolean;

  @Prop()
  replyHiddenAt?: Date;

  @Prop({ trim: true })
  replyHiddenBy?: string;

  @Prop({ trim: true, maxlength: 300 })
  replyHiddenReason?: string;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

/**
 * 🔴 Mỗi dòng hàng trong một đơn chỉ được đánh giá MỘT lần.
 *
 * Đây là khoá duy nhất chặn được hai lần bấm gửi song song cùng tạo hai đánh
 * giá rồi cộng `ratingCount` lên hai — kiểm-rồi-ghi ở tầng ứng dụng luôn có khe
 * hở giữa hai bước. Theo `variant` chứ không theo `product`: mua hai biến thể
 * khác nhau trong cùng một đơn là hai trải nghiệm khác nhau.
 */
ReviewSchema.index({ order: 1, variant: 1 }, { unique: true });

/** Danh sách đánh giá của một sản phẩm: mới nhất trước, lọc theo số sao. */
ReviewSchema.index({ product: 1, createdAt: -1 });
ReviewSchema.index({ product: 1, rating: 1, createdAt: -1 });

/** Trang Đánh giá của người bán, và tab "chưa phản hồi". */
ReviewSchema.index({ shop: 1, createdAt: -1 });
