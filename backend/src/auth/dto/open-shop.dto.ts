import {
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BUSINESS_TYPES } from '../../shops/schemas/shop.schema';

/**
 * Mở gian hàng cho một tài khoản ĐÃ đăng nhập (buyer trở thành seller).
 * Không có trường danh tính/mật khẩu — người dùng được nhận diện qua cookie.
 */
export class OpenShopDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2, { message: 'Tên shop cần tối thiểu 2 ký tự.' })
  @MaxLength(30, { message: 'Tên shop tối đa 30 ký tự.' })
  @Matches(/^[\p{L}\p{M}\p{N} _-]+$/u, {
    message: 'Tên shop chỉ gồm chữ, số, dấu cách, gạch ngang (-) và gạch dưới (_).',
  })
  shopName: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.normalize('NFC').trim() : value,
  )
  @MaxLength(30, { message: 'Họ tên người đại diện tối đa 30 ký tự.' })
  @Matches(/^[\p{L}\p{M}\s]+$/u, {
    message: 'Họ tên không được chứa số hoặc ký tự đặc biệt.',
  })
  contactName: string;

  @Matches(/^\d{9}$/, {
    message: 'Số điện thoại liên hệ gồm 9 chữ số (không tính +84).',
  })
  contactPhone: string;

  @IsIn(BUSINESS_TYPES as unknown as string[], {
    message: 'Loại hình kinh doanh không hợp lệ.',
  })
  businessType: string;

  @ValidateIf((o: OpenShopDto) => o.businessType !== 'personal')
  @IsString()
  @Matches(/^[0-9\-]{8,20}$/, { message: 'Mã số thuế/GPKD gồm 8–20 chữ số.' })
  taxCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Mô tả shop tối đa 500 ký tự.' })
  description?: string;

  @IsString()
  @MaxLength(200)
  street: string;

  @IsString()
  @MaxLength(100)
  ward: string;

  @IsString()
  @MaxLength(100)
  city: string;

  /**
   * Mã hành chính + toạ độ kho lấy hàng — đầu ĐI để tính cước vận chuyển.
   * Optional để shop cũ và địa chỉ nhập tay vẫn mở được; thiếu thì cước lùi
   * về mức liên tỉnh thay vì chặn người bán.
   */
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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoOriginalUrl?: string;

  @IsOptional()
  @IsObject()
  logoCrop?: Record<string, unknown>;
}
