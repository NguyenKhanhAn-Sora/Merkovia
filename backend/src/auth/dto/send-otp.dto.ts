import { IsEmail } from 'class-validator';

export class SendOtpDto {
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  email: string;
}
