import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
  accessCookieName,
  readAccessToken,
  readCookie,
  refreshCookieName,
  scopeFromRequest,
} from '../common/auth-scope';
import { AuthService, OTP_VERIFY_MESSAGES } from './auth.service';
import { AccountService } from './account.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import {
  LoginPhoneDto,
  SendPhoneOtpDto,
  VerifyPhoneOtpDto,
} from './dto/phone-otp.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterSellerDto } from './dto/register-seller.dto';
import { OpenShopDto } from './dto/open-shop.dto';
import { UpdateShopLogoDto } from './dto/update-shop-logo.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthDto } from './dto/google.dto';
import { AvailabilityQueryDto } from './dto/availability.dto';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyResetOtpDto,
} from './dto/password.dto';
import { config } from '../config/config';

/**
 * Tên cookie KHÔNG cố định nữa: mỗi app một bộ riêng để người mua và người bán
 * đăng nhập hai tài khoản khác nhau cùng lúc mà không đè cookie của nhau.
 * Xem `common/auth-scope.ts`.
 */

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountService: AccountService,
  ) {}

  private cookieBase(): CookieOptions {
    return {
      httpOnly: true,
      secure: config.cookie.secure,
      sameSite: config.cookie.sameSite,
      path: '/',
    };
  }

  private setAuthCookies(
    req: Request,
    res: Response,
    access: string,
    refresh: string,
    remember: boolean,
  ) {
    const scope = scopeFromRequest(req);
    const base = this.cookieBase();
    // remember=true → cookie bền (maxAge); false → session cookie (mất khi đóng trình duyệt).
    res.cookie(accessCookieName(scope), access, {
      ...base,
      ...(remember ? { maxAge: config.jwt.accessExpires * 1000 } : {}),
    });
    res.cookie(refreshCookieName(scope), refresh, {
      ...base,
      ...(remember ? { maxAge: config.jwt.refreshExpires * 1000 } : {}),
    });
  }

  /** Chỉ xoá cookie của app gọi tới — đăng xuất bên này không đá bên kia ra. */
  private clearAuthCookies(req: Request, res: Response) {
    const scope = scopeFromRequest(req);
    res.clearCookie(accessCookieName(scope), this.cookieBase());
    res.clearCookie(refreshCookieName(scope), this.cookieBase());
  }

  /** Kiểm tra trùng username / email / SĐT (dùng cho debounce ở form đăng ký). */
  @Get('availability')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  availability(@Query() query: AvailabilityQueryDto) {
    return this.accountService.checkAvailability(query);
  }

  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async send(@Body() dto: SendOtpDto) {
    const result = await this.authService.requestOtp('email', dto.email);
    return { ok: true, message: 'Đã gửi mã OTP tới email của bạn.', ...result };
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  verify(@Body() dto: VerifyOtpDto) {
    const status = this.authService.verifyOtp('email', dto.email, dto.code);
    return {
      ok: status === 'success',
      status,
      message: OTP_VERIFY_MESSAGES[status],
    };
  }

  @Post('otp/phone/send')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async sendPhone(@Body() dto: SendPhoneOtpDto) {
    const result = await this.authService.requestOtp('phone', dto.phone);
    return {
      ok: true,
      message: 'Đã gửi mã OTP tới số điện thoại của bạn.',
      ...result,
    };
  }

  @Post('otp/phone/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  verifyPhone(@Body() dto: VerifyPhoneOtpDto) {
    const status = this.authService.verifyOtp('phone', dto.phone, dto.code);
    return {
      ok: status === 'success',
      status,
      message: OTP_VERIFY_MESSAGES[status],
    };
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.accountService.register(dto);
  }

  /**
   * Đăng ký người bán: tạo tài khoản (role seller) + shop.
   * Đăng nhập luôn sau khi tạo — danh tính đã xác thực qua OTP/Google.
   */
  @Post('register-seller')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async registerSeller(
    @Body() dto: RegisterSellerDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.accountService.registerSeller(dto);
    this.setAuthCookies(req, res, accessToken, refreshToken, true);
    return { user };
  }

  /** Gian hàng của tài khoản đang đăng nhập (null nếu chưa mở shop). */
  @Get('my-shop')
  myShop(@Req() req: Request) {
    return this.accountService.getMyShop(readAccessToken(req));
  }

  /** Cập nhật thông tin gian hàng (chỉ gửi các trường cần đổi). */
  @Patch('my-shop')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  updateShop(@Body() dto: UpdateShopDto, @Req() req: Request) {
    return this.accountService.updateShop(readAccessToken(req), dto);
  }

  /** Đánh dấu đã xong checklist "Hoàn thiện gian hàng" — không hiện lại nữa. */
  @Post('my-shop/setup-done')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  markSetupDone(@Req() req: Request) {
    return this.accountService.markSetupDone(readAccessToken(req));
  }

  /** Đổi logo gian hàng. */
  @Patch('my-shop/logo')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  updateShopLogo(@Body() dto: UpdateShopLogoDto, @Req() req: Request) {
    return this.accountService.updateShopLogo(readAccessToken(req), dto);
  }

  /**
   * Mở gian hàng cho tài khoản ĐÃ đăng nhập (buyer → seller).
   * Nhận diện qua cookie; cấp lại cookie mới mang role seller.
   */
  @Post('open-shop')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async openShop(
    @Body() dto: OpenShopDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = readAccessToken(req);
    const { accessToken, refreshToken, user } =
      await this.accountService.openShop(token, dto);
    // Giữ đăng nhập với phiên mới (đã có role seller). Cookie bền như phiên trước.
    this.setAuthCookies(req, res, accessToken, refreshToken, true);
    return { user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.accountService.login(dto);
    // Token đặt trong cookie httpOnly — KHÔNG trả về body (chống XSS đánh cắp).
    this.setAuthCookies(req, res, accessToken, refreshToken, dto.remember ?? false);
    return { user };
  }

  /**
   * Đăng nhập/đăng ký bằng Google (authorization code từ popup GIS).
   * - Đã có tài khoản → set cookie + trả { user }.
   * - Chưa có → trả { needsProfile, signupToken, profile } để đi bước nhập hồ sơ.
   */
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async google(
    @Body() dto: GoogleAuthDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.accountService.googleAuth(dto);
    if (result.needsProfile) {
      return {
        needsProfile: true,
        signupToken: result.signupToken,
        profile: result.profile,
      };
    }
    this.setAuthCookies(
      req,
      res,
      result.accessToken,
      result.refreshToken,
      dto.remember ?? false,
    );
    return { needsProfile: false, user: result.user };
  }

  @Post('login/phone')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async loginPhone(
    @Body() dto: LoginPhoneDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.accountService.loginWithPhone(dto);
    this.setAuthCookies(req, res, accessToken, refreshToken, dto.remember ?? false);
    return { user };
  }

  /* ------------------------- Quên mật khẩu (3 bước) ------------------------ */

  /** Bước 1 — luôn trả lời chung chung (không lộ email có tồn tại hay không). */
  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.accountService.forgotPassword(dto);
  }

  /** Bước 2 — xác thực OTP, trả token ngắn hạn để đổi mật khẩu. */
  @Post('password/verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyResetOtp(@Body() dto: VerifyResetOtpDto) {
    return this.accountService.verifyResetOtp(dto);
  }

  /** Bước 3 — đặt mật khẩu mới + thu hồi phiên trên MỌI thiết bị. */
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.accountService.resetPassword(dto);
    // Xoá luôn cookie trên thiết bị hiện tại → bắt đăng nhập lại bằng mật khẩu mới.
    this.clearAuthCookies(req, res);
    return result;
  }

  /**
   * Gia hạn phiên bằng refresh token trong cookie.
   * Client gọi ngầm khi gặp 401 để người dùng không bị đá ra trang đăng nhập.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.accountService.refreshSession(
        readCookie(req, refreshCookieName(scopeFromRequest(req))),
      );
    this.setAuthCookies(req, res, accessToken, refreshToken, true);
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.clearAuthCookies(req, res);
    return { ok: true };
  }
}
