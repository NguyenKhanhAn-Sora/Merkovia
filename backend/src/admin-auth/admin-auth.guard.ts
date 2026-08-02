import {
  CanActivate,
  ExecutionContext,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuthService, AdminPrincipal } from './admin-auth.service';
import { readAccessToken } from '../common/auth-scope';

export interface AdminRequest extends Request {
  admin?: AdminPrincipal;
}

/** Chặn mọi route quản trị: đọc access token từ cookie `admin_access_token`. */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    req.admin = this.adminAuthService.principalFromAccessToken(
      readAccessToken(req),
    );
    return true; // principalFromAccessToken tự ném 401 nếu không hợp lệ
  }
}

/** Lấy admin hiện tại trong controller: `@CurrentAdmin() admin: AdminPrincipal`. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminPrincipal =>
    context.switchToHttp().getRequest<AdminRequest>().admin as AdminPrincipal,
);
