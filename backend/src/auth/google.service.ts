import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/config';

export interface GoogleProfile {
  email: string;
  emailVerified: boolean;
  fullName?: string;
  avatarUrl?: string;
  googleId: string;
}

/**
 * Xác thực Google bằng luồng authorization code (popup GIS).
 * Dùng code flow thay vì ID-token flow để frontend giữ được nút thiết kế riêng.
 * redirectUri 'postmessage' là quy ước của Google cho popup code flow.
 */
@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);

  private readonly client = this.isConfigured()
    ? new OAuth2Client({
        clientId: config.google.clientId,
        clientSecret: config.google.clientSecret,
        redirectUri: 'postmessage',
      })
    : null;

  isConfigured(): boolean {
    return Boolean(config.google.clientId && config.google.clientSecret);
  }

  /** Đổi authorization code → thông tin hồ sơ Google đã được xác thực chữ ký. */
  async exchangeCode(code: string): Promise<GoogleProfile> {
    if (!this.client) {
      throw new HttpException(
        'Đăng nhập Google chưa được cấu hình (thiếu GOOGLE_CLIENT_ID/SECRET).',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    let idToken: string | undefined;
    try {
      const { tokens } = await this.client.getToken(code);
      idToken = tokens.id_token ?? undefined;
    } catch (err) {
      this.logger.error('Đổi authorization code với Google thất bại', err as Error);
      throw new UnauthorizedException('Xác thực Google thất bại. Vui lòng thử lại.');
    }
    if (!idToken) {
      throw new UnauthorizedException('Không nhận được thông tin từ Google.');
    }

    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: config.google.clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new UnauthorizedException('Không lấy được email từ tài khoản Google.');
    }

    return {
      email: payload.email.toLowerCase(),
      emailVerified: !!payload.email_verified,
      fullName: payload.name,
      avatarUrl: payload.picture,
      googleId: payload.sub,
    };
  }
}
