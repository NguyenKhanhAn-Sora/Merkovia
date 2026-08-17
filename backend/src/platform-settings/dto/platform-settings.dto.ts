import { Type } from 'class-transformer';
import { IsInt, IsNumber, Max, Min } from 'class-validator';

/** Sửa cấu hình chính sách toàn sàn — luôn gửi đủ mọi trường, không sửa lẻ. */
export class UpdatePlatformSettingsDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'Hoa hồng phải là số.' })
  @Min(0, { message: 'Hoa hồng không được âm.' })
  @Max(1, { message: 'Hoa hồng tối đa 100% (nhập dạng thập phân, vd 0.05 = 5%).' })
  commissionRate: number;

  @Type(() => Number)
  @IsInt({ message: 'Số ngày giữ tiền phải là số nguyên.' })
  @Min(0, { message: 'Số ngày giữ tiền không được âm.' })
  payoutHoldDays: number;

  @Type(() => Number)
  @IsInt({ message: 'Hạn trả hàng phải là số nguyên (ngày).' })
  @Min(0, { message: 'Hạn trả hàng không được âm.' })
  returnWindowDays: number;

  @Type(() => Number)
  @IsInt({ message: 'Hạn sửa đánh giá phải là số nguyên (giờ).' })
  @Min(1, { message: 'Hạn sửa đánh giá phải lớn hơn 0.' })
  reviewEditWindowHours: number;

  @Type(() => Number)
  @IsInt({ message: 'Hạn xác nhận đơn phải là số nguyên (giờ).' })
  @Min(1, { message: 'Hạn xác nhận đơn phải lớn hơn 0.' })
  orderConfirmHours: number;

  @Type(() => Number)
  @IsInt({ message: 'Mốc nhắc xác nhận đơn phải là số nguyên (giờ).' })
  @Min(1, { message: 'Mốc nhắc xác nhận đơn phải lớn hơn 0.' })
  orderConfirmWarnHours: number;

  @Type(() => Number)
  @IsInt({ message: 'Hạn bàn giao vận chuyển phải là số nguyên (giờ).' })
  @Min(1, { message: 'Hạn bàn giao vận chuyển phải lớn hơn 0.' })
  orderShipHours: number;

  @Type(() => Number)
  @IsInt({ message: 'Mốc nhắc bàn giao vận chuyển phải là số nguyên (giờ).' })
  @Min(1, { message: 'Mốc nhắc bàn giao vận chuyển phải lớn hơn 0.' })
  orderShipWarnHours: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'Ngưỡng điểm khẩn cấp phải là số.' })
  @Min(0, { message: 'Ngưỡng điểm khẩn cấp không được âm.' })
  reportUrgentScore: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'Ngưỡng điểm cao phải là số.' })
  @Min(0, { message: 'Ngưỡng điểm cao không được âm.' })
  reportHighScore: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'Ngưỡng điểm trung bình phải là số.' })
  @Min(0, { message: 'Ngưỡng điểm trung bình không được âm.' })
  reportMediumScore: number;
}
