import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ModerationLogDocument = HydratedDocument<ModerationLog>;

export const MODERATION_VERDICTS = ['approve', 'reject', 'error'] as const;
export type ModerationVerdict = (typeof MODERATION_VERDICTS)[number];

export const MODERATION_DECIDERS = ['ai', 'admin'] as const;
export type ModerationDecider = (typeof MODERATION_DECIDERS)[number];

/**
 * Lịch sử BẤT BIẾN mọi lần kiểm duyệt một sản phẩm — mỗi lần AI xét hoặc admin
 * ghi đè tay đều thêm MỘT dòng mới, không sửa/xoá dòng cũ. Tách collection
 * riêng (không nhúng mảng vào Product) vì một sản phẩm bị từ chối rồi sửa lại
 * nhiều lần sẽ tích luỹ nhiều dòng — nhúng vào Product sẽ làm phình tài liệu
 * được đọc trong MỌI danh sách sản phẩm, kể cả khi không ai cần xem lịch sử.
 *
 * Dùng `MongooseSchema.Types.ObjectId` (không phải `Types.ObjectId`) cho các
 * trường tham chiếu — xem bẫy đã ghi nhận: `Types.ObjectId` trong `@Prop` bị
 * Mongoose coi là `Mixed`, không phải ObjectId thật.
 */
@Schema({ timestamps: true })
export class ModerationLog {
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

  @Prop({ type: String, enum: MODERATION_VERDICTS, required: true })
  verdict: ModerationVerdict;

  @Prop({ trim: true, maxlength: 1000 })
  reason?: string;

  @Prop({ type: String, enum: MODERATION_DECIDERS, required: true })
  decidedBy: ModerationDecider;

  /**
   * Chỉ có khi `decidedBy: 'ai'` — tên model Gemini đã dùng.
   * Đặt tên `aiModel` (không phải `model`) vì Mongoose Document đã có sẵn
   * method instance tên `model()` — trùng tên field sẽ vỡ kiểu `.create()`.
   */
  @Prop()
  aiModel?: string;

  /** Chỉ có khi `decidedBy: 'admin'` — email admin đã ghi đè. */
  @Prop()
  adminEmail?: string;
}

export const ModerationLogSchema = SchemaFactory.createForClass(ModerationLog);

ModerationLogSchema.index({ product: 1, createdAt: -1 });
