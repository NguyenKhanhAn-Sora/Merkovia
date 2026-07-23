import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';

/** Đặt hoặc cập nhật khuyến mãi cho một sản phẩm. */
export class SetDealDto {
  /**
   * Giá bán trong thời gian khuyến mãi, áp cho mọi phân loại.
   * Ràng buộc "phải rẻ hơn phân loại rẻ nhất" nằm ở service vì cần biết giá
   * hiện tại của sản phẩm.
   */
  @Type(() => Number)
  @IsInt({ message: 'Giá khuyến mãi phải là số nguyên.' })
  @Min(0, { message: 'Giá khuyến mãi không được âm.' })
  price: number;

  /** Để trống = chạy ngay. */
  @IsOptional()
  @IsDateString({}, { message: 'Thời gian bắt đầu không hợp lệ.' })
  startsAt?: string;

  @IsDateString({}, { message: 'Thời gian kết thúc không hợp lệ.' })
  endsAt: string;
}

export class ListDealsDto {
  /** `live` đang chạy, `scheduled` đã hẹn giờ, `ended` đã kết thúc. */
  @IsOptional()
  @IsIn(['all', 'live', 'scheduled', 'ended'], {
    message: 'Bộ lọc không hợp lệ.',
  })
  tab?: string;
}
