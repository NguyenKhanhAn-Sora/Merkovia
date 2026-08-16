import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

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

/** Trang "Khuyến mãi" của Kênh Quản trị — xem khuyến mãi toàn sàn. */
export class AdminListPromotionsDto {
  /** `flagged` = chỉ khuyến mãi bị nghi ngờ giá ảo. */
  @IsOptional()
  @IsIn(['all', 'live', 'scheduled', 'flagged'], {
    message: 'Bộ lọc không hợp lệ.',
  })
  tab?: string;

  /** Tìm theo tên sản phẩm hoặc tên gian hàng. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
