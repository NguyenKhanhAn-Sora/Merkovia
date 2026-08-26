import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { VOUCHER_TYPES } from '../schemas/voucher.schema';

export class CreateVoucherDto {
  @IsString({ message: 'Vui lòng nhập mã.' })
  @MinLength(3, { message: 'Mã phải có ít nhất 3 ký tự.' })
  @MaxLength(20, { message: 'Mã tối đa 20 ký tự.' })
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'Mã chỉ được gồm chữ và số, không dấu cách hay ký tự đặc biệt.',
  })
  code: string;

  @IsOptional()
  @IsString({ message: 'Mô tả không hợp lệ.' })
  @MaxLength(200, { message: 'Mô tả tối đa 200 ký tự.' })
  description?: string;

  @IsIn(VOUCHER_TYPES, { message: 'Loại giảm giá không hợp lệ.' })
  type: (typeof VOUCHER_TYPES)[number];

  @Type(() => Number)
  @IsInt({ message: 'Giá trị giảm phải là số nguyên.' })
  @Min(1, { message: 'Giá trị giảm phải lớn hơn 0.' })
  value: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Mức giảm tối đa phải là số nguyên.' })
  @Min(1, { message: 'Mức giảm tối đa phải lớn hơn 0.' })
  maxDiscount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Giá trị đơn tối thiểu phải là số nguyên.' })
  @Min(0, { message: 'Giá trị đơn tối thiểu không được âm.' })
  minOrderValue?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Thời gian bắt đầu không hợp lệ.' })
  startsAt?: string;

  @IsDateString({}, { message: 'Thời gian kết thúc không hợp lệ.' })
  endsAt: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Tổng lượt dùng phải là số nguyên.' })
  @Min(1, { message: 'Tổng lượt dùng phải lớn hơn 0.' })
  usageLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số lượt/người phải là số nguyên.' })
  @Min(1, { message: 'Số lượt/người phải lớn hơn 0.' })
  @Max(50, { message: 'Số lượt/người tối đa 50.' })
  perBuyerLimit?: number;
}

export class ListVouchersDto {
  @IsOptional()
  @IsIn(['all', 'live', 'scheduled', 'ended'], {
    message: 'Bộ lọc không hợp lệ.',
  })
  tab?: 'all' | 'live' | 'scheduled' | 'ended';
}

/** Kiểm tra một mã có áp được không — dùng ở trang thanh toán trước khi đặt. */
export class PreviewVoucherDto {
  @IsMongoId({ message: 'Gian hàng không hợp lệ.' })
  shopId: string;

  @IsString({ message: 'Vui lòng nhập mã giảm giá.' })
  @MaxLength(20, { message: 'Mã tối đa 20 ký tự.' })
  code: string;

  @Type(() => Number)
  @IsInt({ message: 'Tiền hàng không hợp lệ.' })
  @Min(0, { message: 'Tiền hàng không hợp lệ.' })
  itemsTotal: number;
}

export class ActiveOnlyDto {
  @IsOptional()
  @IsBoolean()
  activeOnly?: boolean;
}
