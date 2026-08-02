import { IsEmail, IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  email: string;

  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập mật khẩu.' })
  password: string;
}
