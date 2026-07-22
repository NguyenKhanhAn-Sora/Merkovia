import {
  CanActivate,
  ExecutionContext,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccountService } from './account.service';
import { readAccessToken } from '../common/auth-scope';
import type { UserDocument } from '../users/schemas/user.schema';

/** Request đã qua guard thì luôn có `user`. */
export interface AuthedRequest extends Request {
  user?: UserDocument;
}

/**
 * Chặn mọi route cần đăng nhập: đọc access token từ cookie httpOnly, xác thực
 * (kể cả `tokenVersion` để token bị thu hồi hết hiệu lực) rồi gắn user vào request.
 * Dùng chung `AccountService.userFromAccessToken` — chỉ có MỘT nơi kiểm token.
 *
 * Cookie đọc theo APP gửi request: người mua và người bán có hai bộ cookie
 * riêng nên đăng nhập được hai tài khoản khác nhau cùng lúc. Xem
 * `common/auth-scope.ts`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly accountService: AccountService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    req.user = await this.accountService.userFromAccessToken(
      readAccessToken(req),
    );
    return true; // userFromAccessToken tự ném 401 nếu không hợp lệ
  }
}

/** Lấy user hiện tại trong controller: `@CurrentUser() user: UserDocument`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UserDocument =>
    context.switchToHttp().getRequest<AuthedRequest>().user as UserDocument,
);
