import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BUSINESS_TYPES } from '../../shops/schemas/shop.schema';

/**
 * Cập nhật gian hàng. Mọi trường đều tùy chọn — chỉ gửi cái cần đổi.
 * Ràng buộc giữ ĐỒNG BỘ với lúc đăng ký shop (register-seller / open-shop).
 */
export class UpdateShopDto {
  // Tên shop: chỉ được đổi 1 lần / 30 ngày (kiểm tra ở service).
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2, { message: 'Tên shop cần tối thiểu 2 ký tự.' })
  @MaxLength(30, { message: 'Tên shop tối đa 30 ký tự.' })
  @Matches(/^[\p{L}\p{M}\p{N} _-]+$/u, {
    message: 'Tên shop chỉ gồm chữ, số, dấu cách, gạch ngang (-) và gạch dưới (_).',
  })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Mô tả shop tối đa 500 ký tự.' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsIn(BUSINESS_TYPES as unknown as string[], {
    message: 'Loại hình kinh doanh không hợp lệ.',
  })
  businessType?: string;

  // Bắt buộc khi loại hình là hộ KD / doanh nghiệp — kiểm tra chéo ở service.
  @IsOptional()
  @IsString()
  @Matches(/^[0-9\-]{8,20}$/, { message: 'Mã số thuế/GPKD gồm 8–20 chữ số.' })
  taxCode?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.normalize('NFC').trim() : value,
  )
  @MaxLength(30, { message: 'Họ tên người đại diện tối đa 30 ký tự.' })
  @Matches(/^[\p{L}\p{M}\s]+$/u, {
    message: 'Họ tên không được chứa số hoặc ký tự đặc biệt.',
  })
  contactName?: string;

  // Đổi số → bắt buộc đã xác thực OTP (kiểm tra ở service).
  @IsOptional()
  @Matches(/^\d{9}$/, {
    message: 'Số điện thoại liên hệ gồm 9 chữ số (không tính +84).',
  })
  contactPhone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email liên hệ không hợp lệ.' })
  @MaxLength(120)
  contactEmail?: string;

  /* ------------------------- Địa chỉ lấy hàng ---------------------------- */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ward?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  /** Mã hành chính + toạ độ kho lấy hàng — đầu ĐI để tính cước vận chuyển. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  provinceCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  wardCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  /* ----------------------------- Vận hành -------------------------------- */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Thời gian chuẩn bị hàng phải là số ngày.' })
  @Min(1, { message: 'Thời gian chuẩn bị hàng tối thiểu 1 ngày.' })
  @Max(7, { message: 'Thời gian chuẩn bị hàng tối đa 7 ngày.' })
  preparationDays?: number;

  @IsOptional()
  @IsBoolean()
  vacationMode?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Chính sách đổi trả tối đa 1000 ký tự.' })
  returnPolicy?: string;
}
