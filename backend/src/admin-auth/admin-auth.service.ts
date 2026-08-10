import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';
import { config } from '../config/config';
import { AdminLoginDto } from './dto/admin-login.dto';

export interface AdminPrincipal {
  id: string;
  email: string;
}

interface AdminAccessPayload {
  sub: string;
  email: string;
  role: 'admin';
  iat: number;
}

interface AdminRefreshPayload {
  sub: string;
  email: string;
  role: 'admin';
  type: 'refresh';
  iat: number;
}

/** So sánh hằng thời gian — tránh lộ độ dài/nội dung mật khẩu qua thời gian phản hồi. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Vẫn so hai buffer cùng cỡ để thời gian chạy không tiết lộ độ dài lệch nhau.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * Xác thực cho admin root — KHÔNG có bản ghi User trong DB, tài khoản duy nhất
 * cấu hình thẳng trong `.env` (xem `config.admin`). Vì chỉ có một tài khoản,
 * việc thu hồi phiên dùng một mốc thời gian trong bộ nhớ (`revokedBefore`)
 * thay vì `tokenVersion` trên User: đăng xuất hoặc khởi động lại server đều
 * làm mọi access/refresh token phát trước đó hết hiệu lực ngay lập tức, kể cả
 * khi chưa hết hạn — mạnh hơn cơ chế của buyer/seller (đăng xuất bên đó chỉ
 * xoá cookie, không thu hồi token đã phát).
 */
@Injectable()
export class AdminAuthService {
  private readonly jwt = new JwtService({ secret: config.jwt.secret });
  // Khởi tạo bằng thời điểm boot service (không phải 0) để khớp với hành vi
  // đã ghi trong comment ở trên: restart server cũng thu hồi mọi token phát
  // trước đó, không chỉ logout mới thu hồi. Làm tròn xuống đầu giây (như
  // `iat` của JWT, vốn tính bằng giây) để token phát ra ngay trong giây boot
  // không bị coi là "phát trước revokedBefore" rồi bị từ chối oan.
  private revokedBefore = Math.floor(Date.now() / 1000) * 1000;

  private issueTokens(): {
    accessToken: string;
    refreshToken: string;
    admin: AdminPrincipal;
  } {
    const sub = 'root-admin';
    const email = config.admin.email;
    return {
      accessToken: this.jwt.sign(
        { sub, email, role: 'admin' },
        { expiresIn: config.admin.accessExpires },
      ),
      refreshToken: this.jwt.sign(
        { sub, email, role: 'admin', type: 'refresh' },
        { expiresIn: config.admin.refreshExpires },
      ),
      admin: { id: sub, email },
    };
  }

  login(dto: AdminLoginDto) {
    const email = dto.email.trim().toLowerCase();
    const expectedEmail = config.admin.email.trim().toLowerCase();
    // Vẫn chạy so sánh mật khẩu dù email sai, để không lộ qua thời gian phản
    // hồi việc email đúng hay sai (giống thông báo lỗi dùng chung bên dưới).
    const passwordOk = safeEqual(dto.password, config.admin.password);
    const emailOk = safeEqual(email, expectedEmail);
    if (!emailOk || !passwordOk) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }
    return this.issueTokens();
  }

  refresh(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn.');
    }
    let payload: AdminRefreshPayload;
    try {
      payload = this.jwt.verify<AdminRefreshPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn.');
    }
    if (payload.type !== 'refresh' || payload.role !== 'admin') {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn.');
    }
    if (payload.iat * 1000 < this.revokedBefore) {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn.');
    }
    return this.issueTokens();
  }

  principalFromAccessToken(accessToken: string | undefined): AdminPrincipal {
    if (!accessToken) {
      throw new UnauthorizedException('Vui lòng đăng nhập.');
    }
    let payload: AdminAccessPayload;
    try {
      payload = this.jwt.verify<AdminAccessPayload>(accessToken);
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn.');
    }
    if (payload.role !== 'admin') {
      throw new UnauthorizedException('Vui lòng đăng nhập.');
    }
    if (payload.iat * 1000 < this.revokedBefore) {
      throw new UnauthorizedException('Phiên đăng nhập đã hết hạn.');
    }
    return { id: payload.sub, email: payload.email };
  }

  /** Thu hồi mọi token đã phát trước thời điểm này (đăng xuất). */
  logout() {
    this.revokedBefore = Date.now();
  }
}
