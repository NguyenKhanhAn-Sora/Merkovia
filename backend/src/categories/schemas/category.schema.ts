import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

/**
 * Danh mục dạng CÂY, do sàn định nghĩa (seller chỉ chọn).
 *
 * Dùng "materialized path" qua `ancestors`: lưu sẵn toàn bộ tổ tiên nên lọc
 * cả một nhánh chỉ cần MỘT truy vấn `{ ancestors: id }` — không phải đệ quy.
 * Đánh đổi: khi di chuyển nhánh phải cập nhật lại con cháu, nhưng việc đó
 * cực hiếm so với việc đọc/lọc diễn ra liên tục.
 */
@Schema({ timestamps: true })
export class Category {
  @Prop({ trim: true, required: true, maxlength: 80 })
  name: string;

  @Prop({ trim: true, lowercase: true, required: true, unique: true, maxlength: 90 })
  slug: string;

  /** null = danh mục gốc (cấp 0). */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Category',
    default: null,
    index: true,
  })
  parent: Types.ObjectId | null;

  /** Toàn bộ tổ tiên từ gốc xuống, để lọc cả nhánh bằng một index. */
  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Category' }],
    default: [],
    index: true,
  })
  ancestors: Types.ObjectId[];

  /** 0 = ngành hàng gốc. */
  @Prop({ default: 0, index: true })
  level: number;

  /** Thứ tự hiển thị trong cùng một cấp. */
  @Prop({ default: 0 })
  order: number;

  /** Tên icon (Phosphor) cho trang người mua — tùy chọn. */
  @Prop({ trim: true })
  icon?: string;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

// Lấy danh sách con của một node, đã sắp thứ tự.
CategorySchema.index({ parent: 1, order: 1 });
