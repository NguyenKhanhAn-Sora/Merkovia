import {
  IsDateString,
  IsEmail,
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
import { GENDERS } from '../../profiles/schemas/profile.schema';

/**
 * Ràng buộc đăng ký (khớp với validator phía frontend).
 * DTO này sẽ được dùng khi triển khai endpoint hoàn tất đăng ký
 * (tạo User + Profile) — bước "Finish" sẽ làm sau khi có lưu trữ media.
 */
export class RegisterDto {
  /**
   * Đúng MỘT phương thức:
   * - email + password (đã xác thực OTP)
   * - phone (đã xác thực OTP, không password)
   * - googleSignupToken (Google đã xác thực, không password)
   */
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  email?: string;

  @IsOptional()
  @Matches(/^\d{9}$/, { message: 'Số điện thoại gồm 9 chữ số (không tính +84).' })
  phone?: string;

  /** Token ngắn hạn do server phát sau khi xác thực Google thành công. */
  @IsOptional()
  @IsString()
  googleSignupToken?: string;

  // Chỉ bắt buộc & kiểm tra khi đăng ký bằng email (Google/SĐT không dùng mật khẩu).
  @ValidateIf((o: RegisterDto) => !!o.email && !o.googleSignupToken)
  @IsString()
  @MinLength(8, { message: 'Mật khẩu cần tối thiểu 8 ký tự.' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Mật khẩu phải có cả chữ và số.',
  })
  password?: string;

  // \p{M} (dấu tổ hợp) là bắt buộc: tên tiếng Việt dạng NFD sẽ bị chặn oan nếu thiếu.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.normalize('NFC').trim() : value,
  )
  @MaxLength(30, { message: 'Họ và tên tối đa 30 ký tự.' })
  @Matches(/^[\p{L}\p{M}\s]+$/u, {
    message: 'Họ và tên không được chứa số hoặc ký tự đặc biệt.',
  })
  fullName: string;

  @MaxLength(20, { message: 'Tên người dùng tối đa 20 ký tự.' })
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._]*$/, {
    message:
      'Tên người dùng chỉ gồm chữ/số/./_ và không bắt đầu bằng ký tự đặc biệt.',
  })
  username: string;

  @IsOptional()
  @IsIn(GENDERS as unknown as string[], { message: 'Giới tính không hợp lệ.' })
  gender?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Ngày sinh không hợp lệ.' })
  dateOfBirth?: string;

  @IsOptional()
  @MaxLength(200, { message: 'Giới thiệu tối đa 200 ký tự.' })
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ward?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string;

  /** Mã hành chính + toạ độ — đầu ĐẾN để tính cước vận chuyển. */
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
  @MaxLength(500)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarOriginalUrl?: string;

  @IsOptional()
  @IsObject()
  avatarCrop?: Record<string, unknown>;
}
