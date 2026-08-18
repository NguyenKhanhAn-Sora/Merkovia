import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BannerDocument = HydratedDocument<Banner>;

/**
 * Banner quảng cáo trang chủ — carousel nhiều ảnh, admin toàn quyền quản lý
 * (không do seller/shop tạo). Mỗi banner là MỘT ảnh đã thiết kế sẵn đầy đủ
 * (chữ/khuyến mãi nằm trong ảnh), giống cách các sàn TMĐT làm — hệ thống
 * không vẽ chữ đè lên ảnh.
 */
@Schema({ timestamps: true })
export class Banner {
  /** Nhãn nội bộ để admin nhận diện trong danh sách quản lý — KHÔNG hiển thị cho buyer. */
  @Prop({ trim: true, required: true, maxlength: 100 })
  label: string;

  /** Ảnh ĐÃ CẮT theo đúng tỉ lệ hiển thị (16:5) — đây là ảnh buyer thấy. */
  @Prop({ trim: true, required: true })
  imageUrl: string;

  /** Khoá object trên R2 — cần để xoá ảnh khỏi kho lưu trữ khi xoá/thay banner. */
  @Prop({ trim: true, required: true })
  imageKey: string;

  /**
   * Ảnh GỐC (chưa cắt) — giữ lại để lần sau chỉnh crop không bắt admin tải
   * ảnh lên lại từ đầu, giống cơ chế `Shop.logoOriginalUrl`.
   */
  @Prop({ trim: true, required: true })
  imageOriginalUrl: string;

  @Prop({ trim: true, required: true })
  imageOriginalKey: string;

  /** Thông số crop đã dùng (zoom, vị trí, vùng cắt pixel) — để tái hiện lại khung crop khi sửa. */
  @Prop({ type: Object })
  crop?: Record<string, unknown>;

  /**
   * Đường dẫn khi bấm vào banner — admin tự nhập tay (vd `/search?category=...`,
   * `/shop/ten-shop`, `/products/ten-san-pham`). Để trống = banner thuần minh
   * hoạ, không bấm được.
   */
  @Prop({ trim: true, maxlength: 300 })
  link?: string;

  /** Thứ tự hiển thị trong carousel. */
  @Prop({ default: 0 })
  order: number;

  /** Tắt = ẩn khỏi trang chủ ngay, không xoá dữ liệu/ảnh — admin bật lại được. */
  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ trim: true })
  updatedBy?: string;
}

export const BannerSchema = SchemaFactory.createForClass(Banner);

// Trang chủ luôn lọc theo đang bật rồi sắp theo thứ tự.
BannerSchema.index({ isActive: 1, order: 1 });
