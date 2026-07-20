import { HttpException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { OtpStore } from './otp.store';
import { MailService } from './mail.service';
import { SmsSender } from '../sms/sms.sender';

describe('AuthService (OTP logic)', () => {
  const email = 'tester@example.com';
  const phone = '912345678'; // local 9 số → +84912345678
  let service: AuthService;
  let store: OtpStore;
  let lastCode: string;
  let lastSmsTo: string;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-16T00:00:00Z'));
    lastCode = '';
    lastSmsTo = '';
    const mail = {
      sendOtp: jest.fn(async (_to: string, code: string) => {
        lastCode = code;
      }),
    } as unknown as MailService;
    const sms: SmsSender = {
      sendOtp: jest.fn(async (to: string, code: string) => {
        lastSmsTo = to;
        lastCode = code;
      }),
    };
    store = new OtpStore();
    store.delete(`email:${email}`);
    store.delete(`phone:+84${phone}`);
    service = new AuthService(store, mail, sms);
  });

  afterEach(() => {
    store.delete(`email:${email}`);
    store.delete(`phone:+84${phone}`);
    jest.useRealTimers();
  });

  it('verify khi chưa gửi mã → not_found', () => {
    expect(service.verifyOtp('email', email, '123456')).toBe('not_found');
  });

  it('nhập đúng mã → success, và mã dùng một lần (verify lại → not_found)', async () => {
    await service.requestOtp('email', email);
    expect(service.verifyOtp('email', email, lastCode)).toBe('success');
    expect(service.verifyOtp('email', email, lastCode)).toBe('not_found');
  });

  it('nhập sai mã → invalid', async () => {
    await service.requestOtp('email', email);
    const wrong = lastCode === '000000' ? '111111' : '000000';
    expect(service.verifyOtp('email', email, wrong)).toBe('invalid');
  });

  it('sai quá số lần cho phép → too_many_attempts', async () => {
    await service.requestOtp('email', email);
    const wrong = lastCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) {
      expect(service.verifyOtp('email', email, wrong)).toBe('invalid');
    }
    expect(service.verifyOtp('email', email, wrong)).toBe('too_many_attempts');
    expect(service.verifyOtp('email', email, lastCode)).toBe('not_found');
  });

  it('mã hết hạn sau 5 phút → expired', async () => {
    await service.requestOtp('email', email);
    const code = lastCode;
    jest.advanceTimersByTime(5 * 60 * 1000 + 1000);
    expect(service.verifyOtp('email', email, code)).toBe('expired');
  });

  it('gửi lại quá sớm (trong 60s) → chặn 429', async () => {
    await service.requestOtp('email', email);
    await expect(service.requestOtp('email', email)).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('gửi mã mới sau cooldown → chỉ mã mới nhất hợp lệ, mã cũ vô hiệu', async () => {
    await service.requestOtp('email', email);
    const oldCode = lastCode;
    jest.advanceTimersByTime(61 * 1000);
    await service.requestOtp('email', email);
    const newCode = lastCode;
    expect(service.verifyOtp('email', email, oldCode)).toBe('invalid');
    expect(service.verifyOtp('email', email, newCode)).toBe('success');
  });

  // ---- Kênh SĐT dùng chung bộ máy, số được chuẩn hoá về E.164 ----

  it('OTP qua SĐT: gửi tới số E.164 và verify đúng → success', async () => {
    await service.requestOtp('phone', phone);
    expect(lastSmsTo).toBe('+84912345678');
    expect(service.verifyOtp('phone', phone, lastCode)).toBe('success');
  });

  it('OTP email và SĐT độc lập nhau (không đụng khoá của nhau)', async () => {
    await service.requestOtp('email', email);
    const emailCode = lastCode;
    await service.requestOtp('phone', phone);
    const phoneCode = lastCode;

    // Mã của kênh này không dùng được cho kênh kia.
    expect(service.verifyOtp('phone', phone, emailCode)).toBe('invalid');
    expect(service.verifyOtp('email', email, phoneCode)).toBe('invalid');
  });

  it('sau khi verify SĐT thành công → isVerified=true, consume xong → false', async () => {
    await service.requestOtp('phone', phone);
    expect(service.verifyOtp('phone', phone, lastCode)).toBe('success');
    expect(service.isVerified('phone', phone)).toBe(true);
    service.consumeVerified('phone', phone);
    expect(service.isVerified('phone', phone)).toBe(false);
  });
});
