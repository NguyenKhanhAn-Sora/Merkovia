import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PayoutDocument = HydratedDocument<Payout>;

/**
 * Vòng đời một đợt chi trả cho người bán.
 *
 * - `pending`: đã gom đơn, chờ gửi lệnh chuyển tiền.
 * - `processing`: đã gửi lệnh, chờ ngân hàng/nhà cung cấp xác nhận.
 * - `paid`: tiền đã vào tài khoản người bán.
 * - `failed`: chuyển thất bại (sai số tài khoản, ngân hàng từ chối…).
 */
export const PAYOUT_STATUS = [
  'pending',
  'processing',
  'paid',
  'failed',
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUS)[number];

/**
 * Bản chụp tài khoản nhận tiền tại thời điểm chi trả.
 *
 * 🔴 Bắt buộc phải chụp: người bán đổi số tài khoản sau đó thì đợt chi cũ vẫn
 * phải hiện đúng nơi tiền đã đi. Tra ngược sang `Shop.bankAccount` sẽ cho ra
 * thông tin SAI khi có tranh chấp.
 */
@Schema({ _id: false })
export class PayoutBankSnapshot {
  @Prop({ trim: true, required: true })
  bankBin: string;

  @Prop({ trim: true, required: true })
  bankName: string;

  @Prop({ trim: true, required: true })
  accountNumber: string;

  @Prop({ trim: true, required: true })
  accountHolderName: string;
}
const PayoutBankSnapshotSchema =
  SchemaFactory.createForClass(PayoutBankSnapshot);

/**
 * Payout — một đợt chi trả tiền bán hàng cho một gian hàng.
 *
 * Mỗi đơn hàng chỉ được nằm trong ĐÚNG MỘT payout. Việc giành đơn làm bằng
 * `updateMany` có điều kiện `payout: null`, nên hai lần tạo payout đồng thời
 * không thể cùng lấy một đơn và trả tiền hai lần.
 */
@Schema({ timestamps: true })
export class Payout {
  @Prop({ trim: true, uppercase: true, required: true, unique: true })
  code: string;

  @Prop({ type: Types.ObjectId, ref: 'Shop', required: true, index: true })
  shop: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Order' }], default: [] })
  orders: Types.ObjectId[];

  /** Tổng tiền hàng của các đơn (không gồm phí vận chuyển). */
  @Prop({ required: true, min: 0 })
  grossAmount: number;

  /** Hoa hồng sàn giữ lại. */
  @Prop({ required: true, min: 0 })
  commissionAmount: number;

  /** Tỷ lệ hoa hồng áp dụng — chụp lại vì chính sách có thể đổi theo thời gian. */
  @Prop({ required: true, min: 0 })
  commissionRate: number;

  /** Số tiền người bán thực nhận = gross − commission. */
  @Prop({ required: true, min: 0 })
  netAmount: number;

  @Prop({ type: String, enum: PAYOUT_STATUS, required: true, index: true })
  status: PayoutStatus;

  @Prop({ type: PayoutBankSnapshotSchema, required: true })
  bankAccount: PayoutBankSnapshot;

  @Prop({ trim: true, required: true })
  provider: string;

  /** Mã lệnh chuyển tiền phía nhà cung cấp. */
  @Prop({ trim: true })
  providerRef?: string;

  @Prop()
  paidAt?: Date;

  @Prop({ trim: true, maxlength: 300 })
  failureReason?: string;
}

export const PayoutSchema = SchemaFactory.createForClass(Payout);

PayoutSchema.index({ shop: 1, createdAt: -1 });
