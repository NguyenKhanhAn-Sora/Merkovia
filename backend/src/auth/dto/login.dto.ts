import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  email: string;

  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập mật khẩu.' })
  password: string;

  /** true → cookie bền (nhớ đăng nhập); false/absent → session cookie. */
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
