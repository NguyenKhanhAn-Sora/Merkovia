import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { GENDERS } from '../../profiles/schemas/profile.schema';

/** Cập nhật hồ sơ cá nhân. Mọi trường tuỳ chọn — chỉ gửi cái cần đổi. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Họ và tên phải có ít nhất 2 ký tự.' })
  @MaxLength(30, { message: 'Họ và tên tối đa 30 ký tự.' })
  @Matches(/^[\p{L}\p{M}\s]+$/u, {
    message: 'Họ và tên không được chứa số hoặc ký tự đặc biệt.',
  })
  fullName?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Ngày sinh không hợp lệ.' })
  dateOfBirth?: string;

  @IsOptional()
  @IsIn(GENDERS, { message: 'Giới tính không hợp lệ.' })
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Giới thiệu tối đa 200 ký tự.' })
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarOriginalUrl?: string;
}

/**
 * Đổi số điện thoại liên hệ của tài khoản.
 *
 * Đây là chỗ DUY NHẤT bắt xác thực OTP: người dùng đang khai "số này là của
 * tôi". Còn số điện thoại người nhận trong sổ địa chỉ thì KHÔNG xác thực — mua
 * quà gửi mẹ thì số đó là của mẹ, bắt xác thực là chặn luôn đơn hàng.
 */
export class SendPhoneCodeDto {
  @IsString({ message: 'Vui lòng nhập số điện thoại.' })
  @Matches(/^(0|\+?84)?\d{9}$/, {
    message: 'Số điện thoại không hợp lệ (ví dụ: 0912345678).',
  })
  phone: string;
}

export class ChangePhoneDto extends SendPhoneCodeDto {
  @IsString({ message: 'Vui lòng nhập mã OTP.' })
  @Matches(/^\d{6}$/, { message: 'Mã OTP gồm 6 chữ số.' })
  code: string;
}

/**
 * Một mục trong sổ địa chỉ.
 *
 * Giữ đúng ràng buộc với địa chỉ giao hàng lúc đặt đơn — lệch nhau thì người
 * mua lưu được địa chỉ mà tới lúc thanh toán lại bị từ chối.
 */
export class SaveAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'Nhãn địa chỉ tối đa 30 ký tự.' })
  label?: string;

  @IsString({ message: 'Vui lòng nhập họ tên người nhận.' })
  @MinLength(2, { message: 'Họ tên người nhận phải có ít nhất 2 ký tự.' })
  @MaxLength(80, { message: 'Họ tên người nhận tối đa 80 ký tự.' })
  recipientName: string;

  @IsString({ message: 'Vui lòng nhập số điện thoại người nhận.' })
  @MinLength(8, { message: 'Số điện thoại phải có ít nhất 8 chữ số.' })
  @MaxLength(20, { message: 'Số điện thoại tối đa 20 ký tự.' })
  recipientPhone: string;

  @IsString({ message: 'Vui lòng nhập địa chỉ chi tiết.' })
  @MinLength(3, { message: 'Địa chỉ chi tiết phải có ít nhất 3 ký tự.' })
  @MaxLength(200, { message: 'Địa chỉ chi tiết tối đa 200 ký tự.' })
  street: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ward?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Mã phường/xã không hợp lệ.' })
  @Min(1, { message: 'Mã phường/xã không hợp lệ.' })
  wardCode?: number;

  @IsString({ message: 'Vui lòng chọn tỉnh/thành phố.' })
  @MinLength(2, { message: 'Vui lòng chọn tỉnh/thành phố.' })
  @MaxLength(100)
  province: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Mã tỉnh/thành không hợp lệ.' })
  @Min(1, { message: 'Mã tỉnh/thành không hợp lệ.' })
  provinceCode?: number;

  /** Toạ độ từ gợi ý/bản đồ — để tính cước chính xác hơn. */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude({ message: 'Toạ độ địa chỉ không hợp lệ.' })
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: 'Toạ độ địa chỉ không hợp lệ.' })
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
