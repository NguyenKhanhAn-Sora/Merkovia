import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ShippingSettingsDocument = HydratedDocument<ShippingSettings>;

/** Cước của một vùng: cơ bản (gồm 1kg đầu) + phụ phí mỗi 500g tiếp theo + ETA. */
@Schema({ _id: false })
export class ShippingZoneRate {
  @Prop({ required: true, min: 0 })
  base: number;

  @Prop({ required: true, min: 0 })
  perHalfKg: number;

  @Prop({ required: true, min: 0 })
  etaMinDays: number;

  @Prop({ required: true, min: 0 })
  etaMaxDays: number;
}
const ShippingZoneRateSchema = SchemaFactory.createForClass(ShippingZoneRate);

/**
 * Biểu cước vận chuyển toàn sàn — CHỈ MỘT bản ghi duy nhất trong collection
 * (singleton), admin sửa trực tiếp thay vì phải deploy code khi cần đổi giá.
 *
 * 🔴 Cố định 3 vùng (không thêm/xoá được): vùng được HỆ THỐNG tự suy ra từ
 * toạ độ hai đầu đơn hàng (`resolveZone`), không phải khái niệm admin tự đặt
 * tên tuỳ ý — thêm vùng mới ở đây vô nghĩa nếu logic suy vùng không đổi theo.
 */
@Schema({ timestamps: true })
export class ShippingSettings {
  @Prop({ type: ShippingZoneRateSchema, required: true })
  intra_province: ShippingZoneRate;

  @Prop({ type: ShippingZoneRateSchema, required: true })
  inter_province: ShippingZoneRate;

  @Prop({ type: ShippingZoneRateSchema, required: true })
  long_haul: ShippingZoneRate;

  /** Tiền hàng từ mức này trở lên thì miễn phí vận chuyển. */
  @Prop({ required: true, min: 0 })
  freeShippingThreshold: number;

  /** Từ mốc này (km) coi là tuyến xa — chỉ áp dụng khi biết toạ độ hai đầu. */
  @Prop({ required: true, min: 1 })
  longHaulKm: number;

  /** Email admin sửa lần gần nhất — hiển thị "cập nhật lần cuối bởi...". */
  @Prop({ trim: true })
  updatedBy?: string;
}

export const ShippingSettingsSchema =
  SchemaFactory.createForClass(ShippingSettings);
