import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class GoogleAuthDto {
  /** Authorization code lấy từ popup Google Identity Services. */
  @IsString()
  @MinLength(10, { message: 'Mã xác thực Google không hợp lệ.' })
  code: string;

  /** true → cookie bền (nhớ đăng nhập); chỉ dùng khi tài khoản đã tồn tại. */
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
