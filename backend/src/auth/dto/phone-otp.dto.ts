import { IsBoolean, IsOptional, Length, Matches } from 'class-validator';

const PHONE_MSG = 'Số điện thoại gồm 9 chữ số (không tính +84).';

export class SendPhoneOtpDto {
  @Matches(/^\d{9}$/, { message: PHONE_MSG })
  phone: string;
}

export class VerifyPhoneOtpDto {
  @Matches(/^\d{9}$/, { message: PHONE_MSG })
  phone: string;

  @Length(6, 6, { message: 'Mã OTP phải gồm 6 chữ số.' })
  @Matches(/^\d{6}$/, { message: 'Mã OTP chỉ gồm chữ số.' })
  code: string;
}

export class LoginPhoneDto extends VerifyPhoneOtpDto {
  /** true → cookie bền (nhớ đăng nhập); false/absent → session cookie. */
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
