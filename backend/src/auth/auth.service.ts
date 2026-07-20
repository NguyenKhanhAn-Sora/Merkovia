import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { config } from '../config/config';
import { normalizePhone } from '../common/phone';
import { SMS_SENDER } from '../sms/sms.sender';
import type { SmsSender } from '../sms/sms.sender';
import { MailService } from './mail.service';
import { OtpStore } from './otp.store';

/**
 * Kênh OTP. 'reset' tách riêng khỏi 'email' để mã đăng ký KHÔNG dùng chéo
 * được sang đổi mật khẩu (và ngược lại).
 */
export type OtpChannel = 'email' | 'phone' | 'reset';

export type VerifyStatus =
  | 'success'
  | 'invalid'
  | 'expired'
  | 'not_found'
  | 'too_many_attempts';

export const OTP_VERIFY_MESSAGES: Record<VerifyStatus, string> = {
  success: 'Xác thực thành công.',
  invalid: 'Mã OTP không đúng. Vui lòng kiểm tra lại.',
  expired: 'Mã OTP đã hết hạn. Vui lòng gửi lại mã mới.',
  not_found: 'Chưa có mã nào được gửi. Vui lòng gửi mã trước.',
  too_many_attempts: 'Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã mới.',
};

export interface RequestOtpResult {
  ttlSeconds: number;
  resendSeconds: number;
}

/**
 * Bộ máy OTP dùng chung cho MỌI kênh (email / SĐT).
 * Chỉ khác nhau ở bước "gửi" — logic sinh mã, hết hạn, cooldown, số lần thử,
 * chỉ-mã-mới-nhất-hợp-lệ là như nhau.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly store: OtpStore,
    private readonly mail: MailService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  private generateCode(): string {
    const max = 10 ** config.otp.length;
    return randomInt(0, max).toString().padStart(config.otp.length, '0');
  }

  /** Chuẩn hoá định danh theo kênh (phone → E.164, còn lại là email → lowercase). */
  normalizeId(channel: OtpChannel, raw: string): string {
    return channel === 'phone' ? normalizePhone(raw) : raw.trim().toLowerCase();
  }

  private key(channel: OtpChannel, id: string): string {
    return `${channel}:${id}`;
  }

  /** Sinh + gửi OTP mới; ghi đè mã cũ. Chặn gửi lại quá sớm (cooldown). */
  async requestOtp(channel: OtpChannel, rawId: string): Promise<RequestOtpResult> {
    const id = this.normalizeId(channel, rawId);
    const key = this.key(channel, id);
    const now = Date.now();

    const existing = this.store.get(key);
    if (existing) {
      const elapsed = (now - existing.lastSentAt) / 1000;
      const remaining = Math.ceil(config.otp.resendSeconds - elapsed);
      if (remaining > 0) {
        throw new HttpException(
          {
            message: `Vui lòng chờ ${remaining}s trước khi gửi lại mã.`,
            resendIn: remaining,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const code = this.generateCode();

    // Gửi trước, chỉ ghi mã mới khi gửi thành công (mã cũ không bị huỷ oan).
    try {
      if (channel === 'phone') await this.sms.sendOtp(id, code);
      else if (channel === 'reset') await this.mail.sendPasswordResetOtp(id, code);
      else await this.mail.sendOtp(id, code);
    } catch {
      throw new HttpException(
        'Không gửi được mã xác thực. Vui lòng thử lại sau.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    this.store.set(key, {
      code,
      expiresAt: now + config.otp.ttlSeconds * 1000,
      lastSentAt: now,
      attempts: 0,
    });

    return {
      ttlSeconds: config.otp.ttlSeconds,
      resendSeconds: config.otp.resendSeconds,
    };
  }

  /** Xác thực mã người dùng nhập với mã mới nhất đang lưu. */
  verifyOtp(channel: OtpChannel, rawId: string, code: string): VerifyStatus {
    const key = this.key(channel, this.normalizeId(channel, rawId));
    const entry = this.store.get(key);

    if (!entry) return 'not_found';

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return 'expired';
    }

    if (entry.attempts >= config.otp.maxAttempts) {
      this.store.delete(key);
      return 'too_many_attempts';
    }

    if (entry.code !== code) {
      entry.attempts += 1;
      this.store.set(key, entry);
      if (entry.attempts >= config.otp.maxAttempts) {
        this.store.delete(key);
        return 'too_many_attempts';
      }
      return 'invalid';
    }

    // Đúng mã → dùng một lần rồi xoá; đánh dấu đã xác thực để cho phép đăng ký.
    this.store.delete(key);
    this.store.markVerified(key);
    return 'success';
  }

  /** Định danh này đã xác thực OTP gần đây chưa (dùng khi đăng ký). */
  isVerified(channel: OtpChannel, rawId: string): boolean {
    return this.store.isVerified(this.key(channel, this.normalizeId(channel, rawId)));
  }

  consumeVerified(channel: OtpChannel, rawId: string): void {
    this.store.consumeVerified(this.key(channel, this.normalizeId(channel, rawId)));
  }
}
