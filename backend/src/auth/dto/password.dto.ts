import { IsEmail, IsString, Length, Matches, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  email: string;
}

export class VerifyResetOtpDto {
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  email: string;

  @Length(6, 6, { message: 'Mã OTP phải gồm 6 chữ số.' })
  @Matches(/^\d{6}$/, { message: 'Mã OTP chỉ gồm chữ số.' })
  code: string;
}

export class ResetPasswordDto {
  /** Token ngắn hạn do server phát sau khi xác thực OTP thành công. */
  @IsString()
  resetToken: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu cần tối thiểu 8 ký tự.' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Mật khẩu phải có cả chữ và số.',
  })
  password: string;
}
