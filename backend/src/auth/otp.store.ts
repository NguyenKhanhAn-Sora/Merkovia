import { Injectable } from '@nestjs/common';

export interface OtpEntry {
  /** Mã OTP hiện hành (chỉ mã mới nhất mới hợp lệ). */
  code: string;
  /** Mốc hết hạn (epoch ms). */
  expiresAt: number;
  /** Lần gửi gần nhất (epoch ms) — dùng cho cooldown resend. */
  lastSentAt: number;
  /** Số lần nhập sai — chống dò mã. */
  attempts: number;
}

/**
 * Kho OTP in-memory. Gắn vào globalThis để không bị mất khi Nest watch
 * reload trong lúc dev. Đủ dùng cho 1 instance; production nên chuyển sang
 * Redis hoặc Mongo (TTL index) — API của store giữ nguyên khi thay.
 */
const store: Map<string, OtpEntry> =
  (globalThis as { __merkoviaOtpStore?: Map<string, OtpEntry> })
    .__merkoviaOtpStore ??
  ((globalThis as { __merkoviaOtpStore?: Map<string, OtpEntry> }).__merkoviaOtpStore =
    new Map());

/** email → mốc hết hạn (ms) của trạng thái "đã xác thực OTP, chờ đăng ký". */
const verified: Map<string, number> =
  (globalThis as { __merkoviaVerified?: Map<string, number> }).__merkoviaVerified ??
  ((globalThis as { __merkoviaVerified?: Map<string, number> }).__merkoviaVerified =
    new Map());

const VERIFIED_TTL_MS = 15 * 60 * 1000; // 15 phút để hoàn tất đăng ký

@Injectable()
export class OtpStore {
  private key(email: string): string {
    return email.trim().toLowerCase();
  }

  get(email: string): OtpEntry | undefined {
    return store.get(this.key(email));
  }

  /** Ghi đè mã cũ → mọi OTP trước đó lập tức không còn hợp lệ. */
  set(email: string, entry: OtpEntry): void {
    store.set(this.key(email), entry);
  }

  delete(email: string): void {
    store.delete(this.key(email));
  }

  /** Đánh dấu email đã xác thực OTP (cho phép đăng ký trong 15 phút). */
  markVerified(email: string): void {
    verified.set(this.key(email), Date.now() + VERIFIED_TTL_MS);
  }

  isVerified(email: string): boolean {
    const exp = verified.get(this.key(email));
    if (!exp) return false;
    if (Date.now() > exp) {
      verified.delete(this.key(email));
      return false;
    }
    return true;
  }

  consumeVerified(email: string): void {
    verified.delete(this.key(email));
  }
}
