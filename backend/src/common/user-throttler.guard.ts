import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import type { Request } from 'express';

/**
 * Giới hạn tần suất theo PHIÊN ĐĂNG NHẬP thay vì theo IP.
 *
 * Vì sao cần: rất nhiều người dùng Việt Nam ra Internet qua chung một IP (NAT
 * của nhà mạng, mạng công ty, wifi quán). Đếm theo IP nghĩa là một người bán
 * bấm rút tiền vài lần sẽ khoá luôn những người bán khác cùng mạng — họ không
 * hiểu vì sao và cũng không tự khắc phục được.
 *
 * Khi CHƯA đăng nhập thì vẫn đếm theo IP, và đó mới là hành vi đúng: chống dò
 * mật khẩu ở /auth/login phải chặn theo nguồn gửi, không thể theo tài khoản.
 *
 * Băm token trước khi dùng làm khoá — khoá này đi vào bộ nhớ đếm và có thể lọt
 * ra log, không để token thật nằm ở đó.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Request): Promise<string> {
    // Đọc cookie thủ công: dự án không dùng cookie-parser, và guard này chạy
    // TRƯỚC JwtAuthGuard nên cũng chưa có `req.user` để dựa vào.
    const token = readCookie(req, 'access_token');
    if (token) {
      const hash = createHash('sha256').update(token).digest('hex').slice(0, 32);
      return Promise.resolve(`user:${hash}`);
    }
    return Promise.resolve(`ip:${req.ip ?? 'unknown'}`);
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}
