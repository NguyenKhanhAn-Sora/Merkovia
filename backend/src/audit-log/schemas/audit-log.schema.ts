import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

/**
 * Nhật ký thao tác admin — một dòng cho MỖI hành động có ảnh hưởng (duyệt/từ
 * chối, đình chỉ/gỡ đình chỉ, xử lý tranh chấp...). Ghi bất biến, chỉ thêm
 * không sửa/xoá — phục vụ truy vết trách nhiệm khi cần đối chiếu ai đã làm gì.
 *
 * Cố tình KHÔNG dùng ref/ObjectId cho `targetLabel` — nhật ký phải đọc được
 * ngay cả khi đối tượng gốc (shop/đơn/sản phẩm) sau này bị xoá; lưu tên/mã
 * dạng chữ tại thời điểm xảy ra, không populate ngược.
 */
@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ trim: true, required: true, lowercase: true })
  adminEmail: string;

  /** Nhãn hành động ngắn, tiếng Việt — hiển thị trực tiếp lên UI. */
  @Prop({ trim: true, required: true, maxlength: 100 })
  action: string;

  /** Tên/mã đối tượng bị tác động tại thời điểm ghi log (shop, đơn, sản phẩm...). */
  @Prop({ trim: true, maxlength: 150 })
  targetLabel?: string;

  /** Diễn giải thêm — lý do, kết quả. */
  @Prop({ trim: true, maxlength: 500 })
  detail?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ createdAt: -1 });
