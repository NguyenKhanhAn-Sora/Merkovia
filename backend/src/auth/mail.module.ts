import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Tách riêng khỏi `AuthModule` vì `MailService` không phụ thuộc gì (chỉ
 * `nodemailer` + config) — các module KHÔNG liên quan đăng nhập (vd
 * `UsersModule`, `ShopsModule` cần gửi email khoá tài khoản/đình chỉ) import
 * thẳng module này thay vì phải import cả `AuthModule` (sẽ tạo vòng lặp vì
 * `AuthModule` đã import `UsersModule`/`ShopsModule`).
 */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
