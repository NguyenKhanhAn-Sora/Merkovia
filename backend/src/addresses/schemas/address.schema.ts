import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AddressDocument = HydratedDocument<Address>;

/**
 * Address — sổ địa chỉ giao hàng, quan hệ 1 user : N địa chỉ.
 * Tách từng cấp hành chính để phục vụ giao hàng ở VN.
 */
@Schema({ timestamps: true })
export class Address {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  /** Nhãn: "Nhà", "Công ty"… */
  @Prop({ trim: true })
  label?: string;

  @Prop({ trim: true })
  recipientName?: string;

  @Prop({ trim: true })
  recipientPhone?: string;

  /** Địa chỉ chi tiết (số nhà, tên đường). */
  @Prop({ trim: true })
  street?: string;

  /** Phường/Xã. */
  @Prop({ trim: true })
  ward?: string;

  /**
   * Mã phường/xã theo danh mục hành chính.
   *
   * 🔴 Phải lưu MÃ chứ không chỉ tên: tên phường có thể đổi hoặc sáp nhập,
   * lúc đó địa chỉ cũ thành mồ côi không tra ngược được. Mã cũng là thứ đơn vị
   * vận chuyển yêu cầu để tính cước và tạo vận đơn.
   */
  @Prop()
  wardCode?: number;

  /** Quận/Huyện (dữ liệu cũ; cấu trúc hành chính hiện tại chỉ còn 2 cấp). */
  @Prop({ trim: true })
  district?: string;

  /** Tỉnh/Thành phố. */
  @Prop({ trim: true })
  province?: string;

  @Prop()
  provinceCode?: number;

  /**
   * Toạ độ lấy từ dịch vụ bản đồ khi người dùng chọn gợi ý địa chỉ.
   * Đây mới là thứ tính được phí ship theo khoảng cách; thiếu thì hệ thống
   * lùi về tính theo vùng hành chính.
   */
  @Prop()
  lat?: number;

  @Prop()
  lng?: number;

  @Prop({ trim: true, default: 'VN' })
  country: string;

  @Prop({ trim: true })
  postalCode?: string;

  @Prop({ default: false })
  isDefault: boolean;
}

export const AddressSchema = SchemaFactory.createForClass(Address);
