import { IsEmail, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  email: string;

  @Length(6, 6, { message: 'Mã OTP phải gồm 6 chữ số.' })
  @Matches(/^\d{6}$/, { message: 'Mã OTP chỉ gồm chữ số.' })
  code: string;
}
