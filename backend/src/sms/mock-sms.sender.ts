import { Injectable, Logger } from '@nestjs/common';
import { SmsSender } from './sms.sender';

/**
 * Sender giả lập cho môi trường dev: KHÔNG gửi SMS thật, chỉ in mã ra console.
 * Dùng để hoàn thiện luồng OTP mà không tốn phí / không cần giấy tờ.
 */
@Injectable()
export class MockSmsSender implements SmsSender {
  private readonly logger = new Logger('MockSms');

  sendOtp(phone: string, code: string): Promise<void> {
    this.logger.warn(
      `[MOCK SMS] Mã OTP gửi tới ${phone}: ${code}  (chế độ giả lập — không gửi tin nhắn thật)`,
    );
    return Promise.resolve();
  }
}
