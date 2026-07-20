import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Kiểm tra 1 trong 3 định danh có bị trùng trong hệ thống hay không. */
export class AvailabilityQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Tên người dùng tối đa 20 ký tự.' })
  username?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  email?: string;

  @IsOptional()
  @Matches(/^\d{9}$/, { message: 'Số điện thoại gồm 9 chữ số (không tính +84).' })
  phone?: string;
}
