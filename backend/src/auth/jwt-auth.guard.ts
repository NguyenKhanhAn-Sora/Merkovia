import {
  CanActivate,
  ExecutionContext,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccountService } from './account.service';
import type { UserDocument } from '../users/schemas/user.schema';

const ACCESS_COOKIE = 'access_token';

/** Request đã qua guard thì luôn có `user`. */
export interface AuthedRequest extends Request {
  user?: UserDocument;
}

/**
 * Chặn mọi route cần đăng nhập: đọc access token từ cookie httpOnly, xác thực
 * (kể cả `tokenVersion` để token bị thu hồi hết hiệu lực) rồi gắn user vào request.
 * Dùng chung `AccountService.userFromAccessToken` — chỉ có MỘT nơi kiểm token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly accountService: AccountService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    req.user = await this.accountService.userFromAccessToken(
      readCookie(req, ACCESS_COOKIE),
    );
    return true; // userFromAccessToken tự ném 401 nếu không hợp lệ
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

/** Lấy user hiện tại trong controller: `@CurrentUser() user: UserDocument`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UserDocument =>
    context.switchToHttp().getRequest<AuthedRequest>().user as UserDocument,
);
