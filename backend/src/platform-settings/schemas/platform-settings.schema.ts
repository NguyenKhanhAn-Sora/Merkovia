import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformSettingsDocument = HydratedDocument<PlatformSettings>;

/**
 * Cấu hình chính sách vận hành toàn sàn — CHỈ MỘT bản ghi duy nhất (singleton),
 * thay cho các giá trị từng hardcode qua biến môi trường trong `config.ts`.
 * Admin sửa trực tiếp, có hiệu lực ngay không cần deploy — xem
 * `PlatformSettingsService` cho cơ chế cache/refresh.
 */
@Schema({ timestamps: true })
export class PlatformSettings {
  /** Hoa hồng sàn giữ lại trên tiền hàng (0.05 = 5%). */
  @Prop({ required: true, min: 0, max: 1 })
  commissionRate: number;

  /** Số ngày giữ tiền TỐI THIỂU sau khi giao thành công rồi mới cho seller rút. */
  @Prop({ required: true, min: 0 })
  payoutHoldDays: number;

  /** Số ngày kể từ lúc giao thành công mà buyer còn được yêu cầu trả hàng. */
  @Prop({ required: true, min: 0 })
  returnWindowDays: number;

  /** Số giờ kể từ lúc đăng mà buyer còn được sửa đánh giá (một lần duy nhất). */
  @Prop({ required: true, min: 1 })
  reviewEditWindowHours: number;

  /** SLA seller xác nhận đơn (giờ) — huỷ tại mốc này nếu chưa xác nhận. */
  @Prop({ required: true, min: 1 })
  orderConfirmHours: number;

  /** Mốc nhắc trước khi tới hạn xác nhận — PHẢI nhỏ hơn `orderConfirmHours`. */
  @Prop({ required: true, min: 1 })
  orderConfirmWarnHours: number;

  /** SLA seller bàn giao vận chuyển (giờ) — huỷ tại mốc này nếu chưa bàn giao. */
  @Prop({ required: true, min: 1 })
  orderShipHours: number;

  /** Mốc nhắc trước khi tới hạn bàn giao — PHẢI nhỏ hơn `orderShipHours`. */
  @Prop({ required: true, min: 1 })
  orderShipWarnHours: number;

  /** Ngưỡng điểm xếp bậc "khẩn cấp" cho hàng đợi báo cáo vi phạm gian hàng. */
  @Prop({ required: true, min: 0 })
  reportUrgentScore: number;

  /** Ngưỡng điểm xếp bậc "cao" — PHẢI nhỏ hơn hoặc bằng `reportUrgentScore`. */
  @Prop({ required: true, min: 0 })
  reportHighScore: number;

  /** Ngưỡng điểm xếp bậc "trung bình" — PHẢI nhỏ hơn hoặc bằng `reportHighScore`. */
  @Prop({ required: true, min: 0 })
  reportMediumScore: number;

  /** Email admin sửa lần gần nhất. */
  @Prop({ trim: true })
  updatedBy?: string;
}

export const PlatformSettingsSchema =
  SchemaFactory.createForClass(PlatformSettings);
