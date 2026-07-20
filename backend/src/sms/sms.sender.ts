/**
 * Cổng gửi SMS — trừu tượng hoá để đổi nhà cung cấp mà KHÔNG đụng logic OTP.
 * Khi lên production chỉ cần viết thêm 1 class implements SmsSender
 * (Twilio / Zalo ZNS / eSMS…) và khai báo trong SmsModule.
 */
export interface SmsSender {
  /** @param phone Số ở dạng E.164 (vd: +84912345678) */
  sendOtp(phone: string, code: string): Promise<void>;
}

/** DI token (interface không tồn tại lúc runtime nên phải dùng token). */
export const SMS_SENDER = Symbol('SMS_SENDER');
