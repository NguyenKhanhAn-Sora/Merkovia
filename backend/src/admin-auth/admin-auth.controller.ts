import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
  accessCookieName,
  readCookie,
  refreshCookieName,
  scopeFromRequest,
} from '../common/auth-scope';
import { config } from '../config/config';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminAuthGuard, CurrentAdmin } from './admin-auth.guard';
import type { AdminPrincipal } from './admin-auth.service';

@Controller('admin-auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  private cookieBase(): CookieOptions {
    return {
      httpOnly: true,
      secure: config.cookie.secure,
      sameSite: config.cookie.sameSite,
      path: '/',
    };
  }

  /**
   * Không hỗ trợ "ghi nhớ đăng nhập" — cookie luôn là session cookie (mất khi
   * đóng trình duyệt), cộng thêm thời hạn token ngắn, để giảm tối đa thời gian
   * một phiên admin bị lộ có thể còn dùng được.
   */
  private setAuthCookies(
    req: Request,
    res: Response,
    access: string,
    refresh: string,
  ) {
    const scope = scopeFromRequest(req);
    const base = this.cookieBase();
    res.cookie(accessCookieName(scope), access, base);
    res.cookie(refreshCookieName(scope), refresh, base);
  }

  private clearAuthCookies(req: Request, res: Response) {
    const scope = scopeFromRequest(req);
    res.clearCookie(accessCookieName(scope), this.cookieBase());
    res.clearCookie(refreshCookieName(scope), this.cookieBase());
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(
    @Body() dto: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, admin } =
      this.adminAuthService.login(dto);
    this.setAuthCookies(req, res, accessToken, refreshToken);
    return { admin };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = readCookie(
      req,
      refreshCookieName(scopeFromRequest(req)),
    );
    const {
      accessToken,
      refreshToken: nextRefresh,
      admin,
    } = this.adminAuthService.refresh(refreshToken);
    this.setAuthCookies(req, res, accessToken, nextRefresh);
    return { admin };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminAuthGuard)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.adminAuthService.logout();
    this.clearAuthCookies(req, res);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  me(@CurrentAdmin() admin: AdminPrincipal) {
    return { admin };
  }
}
