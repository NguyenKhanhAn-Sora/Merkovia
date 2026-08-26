import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type VoucherDocument = HydratedDocument<Voucher>;

export const VOUCHER_TYPES = ['percent', 'fixed'] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

/**
 * Mã giảm giá của MỘT gian hàng — áp cho tiền hàng (không áp lên phí vận
 * chuyển) của đúng nhóm đơn thuộc shop đó, vì giỏ hàng đã tách theo shop từ
 * trước (xem `OrdersService.buildGroups`).
 *
 * Dùng chung "còn hiệu lực theo thời gian" với `Product.activeDeal` qua
 * `isDealLive`/`isDealScheduled` (`products/deal.ts`) — cùng hình dạng
 * `{startsAt?, endsAt}` nên không cần định nghĩa lại.
 */
@Schema({ timestamps: true })
export class Voucher {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true,
  })
  shop: Types.ObjectId;

  /** Duy nhất TRONG PHẠM VI một shop — hai shop được trùng mã. */
  @Prop({ trim: true, uppercase: true, required: true })
  code: string;

  @Prop({ trim: true, maxlength: 200 })
  description?: string;

  @Prop({ type: String, enum: VOUCHER_TYPES, required: true })
  type: VoucherType;

  /** `percent`: 1–100. `fixed`: số tiền VND. */
  @Prop({ required: true, min: 1 })
  value: number;

  /** Trần số tiền giảm — chỉ có ý nghĩa với `percent` (chặn giảm vô hạn trên đơn to). */
  @Prop({ min: 1 })
  maxDiscount?: number;

  /** Đơn phải đạt tiền hàng tối thiểu này (trước giảm) mới áp được mã. */
  @Prop({ required: true, min: 0, default: 0 })
  minOrderValue: number;

  @Prop()
  startsAt?: Date;

  @Prop({ required: true })
  endsAt: Date;

  /** `null` = không giới hạn tổng lượt dùng. */
  @Prop({ type: Number, default: null })
  usageLimit: number | null;

  @Prop({ required: true, min: 0, default: 0 })
  usedCount: number;

  @Prop({ required: true, min: 1, default: 1 })
  perBuyerLimit: number;

  /**
   * Người bán chủ động kết thúc sớm — giống `activeDeal` bị xoá, mã vẫn giữ
   * lại trong DB để còn tra lịch sử, không lùi `endsAt` về quá khứ.
   */
  @Prop({ default: false })
  ended: boolean;
}
export const VoucherSchema = SchemaFactory.createForClass(Voucher);

// Mã chỉ cần duy nhất TRONG một shop.
VoucherSchema.index({ shop: 1, code: 1 }, { unique: true });
// Trang buyer/checkout luôn lọc theo shop rồi lọc "còn hiệu lực".
VoucherSchema.index({ shop: 1, ended: 1, endsAt: 1 });

export type VoucherRedemptionDocument = HydratedDocument<VoucherRedemption>;

/**
 * Một lượt dùng mã đã được GIÀNH (redeem) — nguồn đếm cho `perBuyerLimit`.
 *
 * Gắn theo `checkoutGroup` chứ không phải `Order`: việc giành mã xảy ra
 * TRƯỚC khi đơn được ghi (cùng thời điểm giữ kho, xem
 * `OrdersService.checkout`), lúc đó đơn chưa tồn tại. `checkoutGroup` đã được
 * sinh sẵn từ đầu lượt thanh toán nên dùng được ngay.
 */
@Schema({ timestamps: true })
export class VoucherRedemption {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Voucher',
    required: true,
    index: true,
  })
  voucher: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Shop', required: true })
  shop: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  buyer: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  checkoutGroup: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  discountAmount: number;
}
export const VoucherRedemptionSchema =
  SchemaFactory.createForClass(VoucherRedemption);

// `perBuyerLimit` đếm bằng COUNT trên cặp này.
VoucherRedemptionSchema.index({ voucher: 1, buyer: 1 });
