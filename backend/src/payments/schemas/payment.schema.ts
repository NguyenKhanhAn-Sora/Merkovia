import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PaymentDocument = HydratedDocument<Payment>;

/**
 * Vòng đời một phiên thanh toán online.
 *
 * - `pending`: đã tạo phiên ở cổng, đang chờ người mua trả tiền.
 * - `paid`: cổng xác nhận đã thu đủ tiền.
 * - `failed`: người mua huỷ hoặc cổng từ chối. Còn trong hạn thì tạo phiên mới.
 * - `expired`: hết hạn giữ kho mà chưa trả.
 * - `refunded`: đã hoàn tiền cho người mua.
 */
export const PAYMENT_STATUS = [
  'pending',
  'paid',
  'failed',
  'expired',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

/**
 * Nhật ký sự kiện từ cổng thanh toán — giữ NGUYÊN VĂN payload.
 *
 * Khi lệch tiền, đây là bằng chứng duy nhất để đối chiếu với sao kê của cổng.
 * Tuyệt đối không ghi đè, chỉ thêm vào.
 */
@Schema({ _id: false })
export class PaymentEvent {
  @Prop({ required: true })
  at: Date;

  @Prop({ trim: true, required: true })
  type: string;

  /** Payload thô của cổng, để đối soát và điều tra khi có tranh chấp. */
  @Prop({ type: Object })
  payload?: Record<string, unknown>;

  @Prop({ trim: true })
  note?: string;
}
const PaymentEventSchema = SchemaFactory.createForClass(PaymentEvent);

/**
 * Payment — MỘT phiên thanh toán cho MỘT lần bấm "Đặt hàng".
 *
 * 🔴 Gắn với `checkoutGroup` chứ KHÔNG phải từng đơn: giỏ 3 gian hàng tách
 * thành 3 đơn nhưng người mua chỉ trả tiền một lần. Nếu làm theo từng đơn thì
 * họ phải thanh toán 3 lần cho một lần mua, và số tiền gửi sang cổng cũng
 * không khớp với thứ họ nhìn thấy trên màn hình.
 */
@Schema({ timestamps: true })
export class Payment {
  /** Mã phiên gửi sang cổng, cũng là khoá đối soát hai chiều. */
  @Prop({ trim: true, uppercase: true, required: true, unique: true })
  code: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  buyer: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  checkoutGroup: Types.ObjectId;

  /** Các đơn được phiên này thanh toán. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Order' }], required: true })
  orders: Types.ObjectId[];

  /** Số tiền PHẢI thu, tính từ DB. Webhook báo khác số này là có vấn đề. */
  @Prop({ required: true, min: 0 })
  amount: number;

  /** Số tiền cổng báo đã thu thực tế. */
  @Prop({ min: 0 })
  paidAmount?: number;

  @Prop({ type: String, enum: PAYMENT_STATUS, required: true, index: true })
  status: PaymentStatus;

  /** Nhà cung cấp xử lý phiên này (`mock` = giả lập). */
  @Prop({ trim: true, required: true })
  provider: string;

  /** Mã giao dịch phía cổng — dùng để hỏi ngược khi đối soát. */
  @Prop({ trim: true, index: true })
  providerRef?: string;

  /** Link người mua bấm vào để trả tiền. */
  @Prop({ trim: true })
  checkoutUrl?: string;

  @Prop({ index: true })
  expiresAt?: Date;

  @Prop()
  paidAt?: Date;

  /**
   * 🔴 Tiền đã thu nhưng đơn không còn nhận được (đã huỷ do quá hạn, hoặc số
   * tiền lệch). Phải hoàn lại cho người mua — đánh dấu để job/con người xử lý,
   * KHÔNG được im lặng bỏ qua vì đây là tiền thật của khách.
   */
  @Prop({ default: false, index: true })
  needsRefund: boolean;

  @Prop({ trim: true, maxlength: 300 })
  refundReason?: string;

  @Prop()
  refundedAt?: Date;

  /**
   * Id sự kiện đã xử lý từ cổng — chống áp dụng hai lần khi cổng gửi lại
   * webhook (mọi cổng đều retry khi không nhận được 200).
   */
  @Prop({ type: [String], default: [] })
  handledEventIds: string[];

  @Prop({ type: [PaymentEventSchema], default: [] })
  events: PaymentEvent[];
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

// Đối soát: quét các phiên còn treo quá lâu để hỏi ngược cổng.
PaymentSchema.index({ status: 1, createdAt: 1 });
