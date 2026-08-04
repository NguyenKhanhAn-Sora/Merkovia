import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { config } from '../config/config';
import {
  renderNoPasswordEmail,
  renderNoPasswordText,
  renderOtpEmail,
  renderOtpText,
  renderPasswordResetEmail,
  renderPasswordResetText,
  renderShopViolationEmail,
  renderShopViolationText,
} from './otp-email.template';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });

  async sendOtp(to: string, code: string): Promise<void> {
    const ttlMinutes = Math.round(config.otp.ttlSeconds / 60);
    try {
      await this.transporter.sendMail({
        from: config.smtp.from,
        to,
        replyTo: config.smtp.user,
        subject: `Mã xác thực Merkovia của bạn: ${code}`,
        text: renderOtpText(code, ttlMinutes),
        html: renderOtpEmail(code, ttlMinutes),
        headers: {
          'X-Entity-Ref-ID': `merkovia-otp-${Date.now()}`,
        },
      });
      this.logger.log(`Đã gửi OTP tới ${to}`);
    } catch (err) {
      this.logger.error(`Gửi OTP tới ${to} thất bại`, err as Error);
      throw err;
    }
  }

  /** OTP cho luồng đặt lại mật khẩu (nội dung khác OTP đăng ký). */
  async sendPasswordResetOtp(to: string, code: string): Promise<void> {
    const ttlMinutes = Math.round(config.otp.ttlSeconds / 60);
    try {
      await this.transporter.sendMail({
        from: config.smtp.from,
        to,
        replyTo: config.smtp.user,
        subject: `Mã đặt lại mật khẩu Merkovia: ${code}`,
        text: renderPasswordResetText(code, ttlMinutes),
        html: renderPasswordResetEmail(code, ttlMinutes),
      });
      this.logger.log(`Đã gửi OTP đặt lại mật khẩu tới ${to}`);
    } catch (err) {
      this.logger.error(
        `Gửi OTP đặt lại mật khẩu tới ${to} thất bại`,
        err as Error,
      );
      throw err;
    }
  }

  /**
   * Báo tài khoản không dùng mật khẩu (Google/SĐT). Gửi âm thầm để web
   * vẫn trả lời chung chung — chỉ chủ hộp thư mới biết sự thật.
   */
  async sendNoPasswordNotice(to: string, method: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: config.smtp.from,
        to,
        replyTo: config.smtp.user,
        subject: 'Về yêu cầu đặt lại mật khẩu Merkovia',
        text: renderNoPasswordText(method),
        html: renderNoPasswordEmail(method),
      });
      this.logger.log(`Đã gửi thông báo "không có mật khẩu" tới ${to}`);
    } catch (err) {
      this.logger.error(`Gửi thông báo tới ${to} thất bại`, err as Error);
      throw err;
    }
  }

  /** Báo chủ gian hàng bị admin xử lý (cảnh báo hoặc tạm đình chỉ) sau báo cáo vi phạm. */
  async sendShopViolationNotice(
    to: string,
    params: {
      shopName: string;
      action: 'warning' | 'suspend';
      reasons: string;
      note: string;
    },
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: config.smtp.from,
        to,
        replyTo: config.smtp.user,
        subject:
          params.action === 'suspend'
            ? `Gian hàng "${params.shopName}" đã bị tạm đình chỉ trên Merkovia`
            : `Cảnh báo vi phạm cho gian hàng "${params.shopName}" trên Merkovia`,
        text: renderShopViolationText(params),
        html: renderShopViolationEmail(params),
      });
      this.logger.log(
        `Đã gửi email xử lý báo cáo (${params.action}) tới ${to}`,
      );
    } catch (err) {
      this.logger.error(
        `Gửi email xử lý báo cáo tới ${to} thất bại`,
        err as Error,
      );
      throw err;
    }
  }
}
