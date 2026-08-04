import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Connection, Model, Types } from 'mongoose';
import { config } from '../config/config';
import { normalizePhone } from '../common/phone';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Gender, Profile, ProfileDocument } from '../profiles/schemas/profile.schema';
import { Address, AddressDocument } from '../addresses/schemas/address.schema';
import { BusinessType, Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { UpdateShopDto } from './dto/update-shop.dto';
import { AuthService, OTP_VERIFY_MESSAGES, OtpChannel } from './auth.service';
import { GoogleService } from './google.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterSellerDto } from './dto/register-seller.dto';
import { OpenShopDto } from './dto/open-shop.dto';
import { UpdateShopLogoDto } from './dto/update-shop-logo.dto';
import { LoginDto } from './dto/login.dto';
import { LoginPhoneDto } from './dto/phone-otp.dto';
import { GoogleAuthDto } from './dto/google.dto';
import { AvailabilityQueryDto } from './dto/availability.dto';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyResetOtpDto,
} from './dto/password.dto';
import { MailService } from './mail.service';

/**
 * Ảnh mặc định của người bán — asset tĩnh của app seller (public/).
 * Dùng cho cả avatar hồ sơ seller lẫn logo gian hàng khi chưa tải ảnh riêng.
 */
const SELLER_DEFAULT_AVATAR = '/avatar_seller.png';
const SHOP_DEFAULT_LOGO = SELLER_DEFAULT_AVATAR;

/** Có phải logo do shop tự tải lên không (khác ảnh mặc định của hệ thống). */
function isCustomLogo(url?: string): boolean {
  return !!url && !url.includes('avatar_seller');
}

/** Tên shop chỉ được đổi 1 lần trong khoảng thời gian này. */
const NAME_CHANGE_COOLDOWN_DAYS = 30;

/** Nhãn trong token đăng ký Google ngắn hạn (chống dùng nhầm token khác). */
const GOOGLE_SIGNUP_PURPOSE = 'google_signup';
/** Nhãn trong token đặt lại mật khẩu ngắn hạn. */
const PASSWORD_RESET_PURPOSE = 'password_reset';

/**
 * Thông báo DUY NHẤT của luồng quên mật khẩu — không tiết lộ email có tồn tại
 * hay không (chống dò tài khoản & email bombing). Thông tin cụ thể nằm trong
 * email gửi tới hộp thư, chỉ chủ sở hữu đọc được.
 */
const FORGOT_GENERIC_MESSAGE =
  'Nếu email này có trong hệ thống, mã xác thực đã được gửi. Vui lòng kiểm tra hộp thư (kể cả mục Spam).';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
    @InjectModel(Address.name)
    private readonly addressModel: Model<AddressDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    private readonly google: GoogleService,
    private readonly mail: MailService,
  ) {}

  /* ---------------------------- Quên mật khẩu ---------------------------- */

  /**
   * Bước 1: yêu cầu mã đặt lại mật khẩu.
   * LUÔN trả về cùng một thông báo, dù email có tồn tại hay không.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userModel.findOne({ email });

    try {
      if (user?.passwordHash) {
        // Tài khoản có mật khẩu → gửi OTP đặt lại.
        await this.auth.requestOtp('reset', email);
      } else if (user) {
        // Có tài khoản nhưng đăng nhập bằng Google/SĐT → báo qua email.
        const method = user.authProviders?.some((p) => p.provider === 'google')
          ? 'Google'
          : 'mã OTP số điện thoại';
        await this.mail.sendNoPasswordNotice(email, method);
      }
      // Email không tồn tại → không gửi gì (tránh biến server thành công cụ spam).
    } catch (err) {
      // Nuốt lỗi (kể cả 429 cooldown) để không lộ email có tồn tại hay không.
      this.logger.warn(`forgotPassword: bỏ qua lỗi nội bộ — ${String(err)}`);
    }

    return {
      ok: true,
      message: FORGOT_GENERIC_MESSAGE,
      resendSeconds: config.otp.resendSeconds,
    };
  }

  /** Bước 2: xác thực OTP → phát token ngắn hạn để đổi mật khẩu. */
  verifyResetOtp(dto: VerifyResetOtpDto) {
    const email = dto.email.trim().toLowerCase();
    const status = this.auth.verifyOtp('reset', email, dto.code);
    if (status !== 'success') {
      // Gộp mọi thất bại vào 1 thông báo: không lộ email có tồn tại hay không.
      throw new UnauthorizedException('Mã xác thực không đúng hoặc đã hết hạn.');
    }
    this.auth.consumeVerified('reset', email);
    return {
      ok: true,
      resetToken: this.jwt.sign(
        { email, purpose: PASSWORD_RESET_PURPOSE },
        { expiresIn: 600 }, // 10 phút để đặt mật khẩu mới
      ),
    };
  }

  /**
   * Bước 3: đặt mật khẩu mới.
   * Tăng tokenVersion → mọi access/refresh token cũ trên MỌI thiết bị hết hiệu lực.
   */
  async resetPassword(dto: ResetPasswordDto) {
    let email: string;
    try {
      const p = this.jwt.verify<{ email: string; purpose: string }>(
        dto.resetToken,
      );
      if (p.purpose !== PASSWORD_RESET_PURPOSE) throw new Error('sai purpose');
      email = p.email;
    } catch {
      throw new ForbiddenException(
        'Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.',
      );
    }

    const user = await this.userModel.findOne({ email });
    if (!user?.passwordHash) {
      throw new ForbiddenException('Tài khoản không hợp lệ để đặt lại mật khẩu.');
    }

    // Chặn đặt lại đúng mật khẩu cũ: nếu tài khoản đang bị chiếm, giữ nguyên
    // mật khẩu sẽ khiến việc thu hồi phiên bên dưới trở nên vô nghĩa.
    if (await bcrypt.compare(dto.password, user.passwordHash)) {
      throw new BadRequestException(
        'Mật khẩu mới phải khác mật khẩu hiện tại.',
      );
    }

    user.passwordHash = await bcrypt.hash(dto.password, 10);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1; // đá mọi phiên cũ
    await user.save();

    this.logger.log(`Đã đặt lại mật khẩu cho ${email}; thu hồi toàn bộ phiên cũ.`);
    return { ok: true, message: 'Đặt lại mật khẩu thành công.' };
  }

  /**
   * Đăng nhập/đăng ký bằng Google.
   * - Đã có tài khoản → đăng nhập luôn (liên kết provider nếu chưa có).
   * - Chưa có → trả token ngắn hạn (15') để đi tiếp bước nhập hồ sơ.
   */
  async googleAuth(dto: GoogleAuthDto) {
    const g = await this.google.exchangeCode(dto.code);
    if (!g.emailVerified) {
      throw new UnauthorizedException('Email Google này chưa được xác minh.');
    }

    const user = await this.userModel.findOne({ email: g.email });
    if (user) {
      // Liên kết Google vào tài khoản sẵn có (vd: trước đó đăng ký bằng email).
      if (!user.authProviders?.some((p) => p.provider === 'google')) {
        user.authProviders = [
          ...(user.authProviders ?? []),
          { provider: 'google', providerId: g.googleId },
        ];
      }
      user.emailVerified = true;
      const session = await this.issueSession(user);
      return { needsProfile: false as const, ...session };
    }

    return {
      needsProfile: true as const,
      signupToken: this.jwt.sign(
        { email: g.email, gid: g.googleId, purpose: GOOGLE_SIGNUP_PURPOSE },
        { expiresIn: 900 },
      ),
      profile: { email: g.email, fullName: g.fullName, avatarUrl: g.avatarUrl },
    };
  }

  private verifyGoogleSignupToken(token: string): { email: string; gid: string } {
    try {
      const p = this.jwt.verify<{ email: string; gid: string; purpose: string }>(
        token,
      );
      if (p.purpose !== GOOGLE_SIGNUP_PURPOSE) throw new Error('sai purpose');
      return { email: p.email, gid: p.gid };
    } catch {
      throw new ForbiddenException(
        'Phiên đăng ký Google không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.',
      );
    }
  }

  /**
   * Kiểm tra một định danh (username / email / SĐT) đã có trong hệ thống chưa.
   * Dùng cho debounce check ở form đăng ký.
   */
  async checkAvailability(q: AvailabilityQueryDto): Promise<{ available: boolean }> {
    const provided = [q.username, q.email, q.phone].filter(Boolean);
    if (provided.length !== 1) {
      throw new BadRequestException(
        'Cần đúng một tham số: username, email hoặc phone.',
      );
    }

    if (q.username) {
      const taken = await this.profileModel.exists({
        username: q.username.trim().toLowerCase(),
      });
      return { available: !taken };
    }
    if (q.email) {
      const taken = await this.userModel.exists({
        email: q.email.trim().toLowerCase(),
      });
      return { available: !taken };
    }
    const taken = await this.userModel.exists({
      phone: normalizePhone(q.phone as string),
    });
    return { available: !taken };
  }

  /**
   * Hoàn tất đăng ký bằng EMAIL (kèm mật khẩu) hoặc SĐT (OTP, không mật khẩu).
   * Chỉ cho phép khi định danh đã xác thực OTP. Tạo User + Profile + Address
   * trong 1 transaction. Không cấp token (chưa login).
   */
  async register(dto: RegisterDto) {
    const google = dto.googleSignupToken
      ? this.verifyGoogleSignupToken(dto.googleSignupToken)
      : null;

    const email = google?.email ?? dto.email?.trim().toLowerCase();
    const phone = dto.phone ? normalizePhone(dto.phone) : undefined;

    // Đúng một phương thức: Google | email | SĐT.
    const methods = [google ? 1 : 0, !google && dto.email ? 1 : 0, phone ? 1 : 0];
    if (methods.reduce((a, b) => a + b, 0) !== 1) {
      throw new BadRequestException(
        'Cần đúng một phương thức đăng ký: email, số điện thoại hoặc Google.',
      );
    }

    // Google đã được xác thực qua token do chính server ký → không cần OTP.
    if (!google) {
      const channel: OtpChannel = email ? 'email' : 'phone';
      const identifier = (email ?? phone) as string;
      if (!this.auth.isVerified(channel, identifier)) {
        throw new ForbiddenException(
          'Định danh chưa được xác thực hoặc phiên đăng ký đã hết hạn.',
        );
      }
      if (email && !dto.password) {
        throw new BadRequestException('Vui lòng nhập mật khẩu.');
      }
    }

    if (email && (await this.userModel.exists({ email }))) {
      throw new ConflictException('Email này đã được đăng ký.');
    }
    if (phone && (await this.userModel.exists({ phone }))) {
      throw new ConflictException('Số điện thoại này đã được đăng ký.');
    }
    const username = dto.username?.trim().toLowerCase();
    if (username && (await this.profileModel.exists({ username }))) {
      throw new ConflictException('Tên người dùng đã tồn tại.');
    }

    // Google/SĐT không dùng mật khẩu.
    const passwordHash =
      dto.password && !google ? await bcrypt.hash(dto.password, 10) : undefined;

    const session = await this.connection.startSession();
    let userId: string | undefined;

    try {
      await session.withTransaction(async () => {
        const [user] = await this.userModel.create(
          [
            {
              email,
              phone,
              passwordHash,
              emailVerified: !!email,
              phoneVerified: !!phone,
              authProviders: google
                ? [{ provider: 'google', providerId: google.gid }]
                : [],
              roles: ['buyer'],
              status: 'active',
            },
          ],
          { session },
        );
        userId = String(user._id);

        await this.profileModel.create(
          [
            {
              user: user._id,
              fullName: dto.fullName.trim(),
              displayName: dto.fullName.trim(),
              username,
              gender: dto.gender as Gender | undefined,
              dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
              bio: dto.bio?.trim() || undefined,
              avatarUrl: dto.avatarUrl,
              avatarOriginalUrl: dto.avatarOriginalUrl,
              avatarCrop: dto.avatarCrop,
            },
          ],
          { session },
        );

        if (dto.street || dto.city || dto.ward) {
          await this.addressModel.create(
            [
              {
                user: user._id,
                // 🔴 Người nhận mặc định chính là chủ tài khoản. Bỏ trống thì
                // sổ địa chỉ hiện mỗi con đường, và đơn hàng đi ra không có
                // tên người nhận để hãng vận chuyển gọi.
                recipientName: dto.fullName.trim(),
                recipientPhone: phone,
                street: dto.street?.trim(),
                ward: dto.ward?.trim(),
                wardCode: dto.wardCode,
                province: dto.city?.trim(),
                // Mã tỉnh + toạ độ là đầu ĐẾN khi tính cước vận chuyển.
                provinceCode: dto.provinceCode,
                lat: dto.lat,
                lng: dto.lng,
                country: dto.country?.trim() || 'Việt Nam',
                isDefault: true,
              },
            ],
            { session },
          );
        }
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException(
          'Email, số điện thoại hoặc tên người dùng đã tồn tại.',
        );
      }
      this.logger.error('Đăng ký thất bại', err as Error);
      throw new InternalServerErrorException(
        'Không thể tạo tài khoản. Vui lòng thử lại.',
      );
    } finally {
      await session.endSession();
    }

    if (!google) {
      this.auth.consumeVerified(email ? 'email' : 'phone', (email ?? phone) as string);
    }
    return { ok: true, userId };
  }

  /**
   * Đăng ký NGƯỜI BÁN: danh tính (email/SĐT/Google, giống buyer) + thông tin shop.
   * Tạo User (role buyer+seller) + Profile tối giản + Shop (status pending, chờ
   * admin duyệt) trong 1 transaction. Không cấp token (chưa login).
   */
  async registerSeller(dto: RegisterSellerDto) {
    const google = dto.googleSignupToken
      ? this.verifyGoogleSignupToken(dto.googleSignupToken)
      : null;

    const email = google?.email ?? dto.email?.trim().toLowerCase();
    const phone = dto.phone ? normalizePhone(dto.phone) : undefined;

    const methods = [google ? 1 : 0, !google && dto.email ? 1 : 0, phone ? 1 : 0];
    if (methods.reduce((a, b) => a + b, 0) !== 1) {
      throw new BadRequestException(
        'Cần đúng một phương thức đăng ký: email, số điện thoại hoặc Google.',
      );
    }

    if (!google) {
      const channel: OtpChannel = email ? 'email' : 'phone';
      const identifier = (email ?? phone) as string;
      if (!this.auth.isVerified(channel, identifier)) {
        throw new ForbiddenException(
          'Định danh chưa được xác thực hoặc phiên đăng ký đã hết hạn.',
        );
      }
      if (email && !dto.password) {
        throw new BadRequestException('Vui lòng nhập mật khẩu.');
      }
    }

    // Tài khoản đã tồn tại → hướng người dùng đăng nhập rồi mở shop, thay vì
    // tạo tài khoản trùng (tài khoản seller & buyer dùng chung một định danh).
    if (email && (await this.userModel.exists({ email }))) {
      throw new ConflictException(
        'Email này đã có tài khoản. Vui lòng đăng nhập để mở shop.',
      );
    }
    if (phone && (await this.userModel.exists({ phone }))) {
      throw new ConflictException(
        'Số điện thoại này đã có tài khoản. Vui lòng đăng nhập để mở shop.',
      );
    }

    const passwordHash =
      dto.password && !google ? await bcrypt.hash(dto.password, 10) : undefined;
    const slug = await this.uniqueShopSlug(dto.shopName);

    const session = await this.connection.startSession();
    let createdUser: UserDocument | undefined;
    let shopId: string | undefined;

    try {
      await session.withTransaction(async () => {
        const [user] = await this.userModel.create(
          [
            {
              email,
              phone,
              passwordHash,
              emailVerified: !!email,
              phoneVerified: !!phone,
              authProviders: google
                ? [{ provider: 'google', providerId: google.gid }]
                : [],
              roles: ['buyer', 'seller'],
              status: 'active',
            },
          ],
          { session },
        );
        createdUser = user;

        await this.profileModel.create(
          [
            {
              user: user._id,
              fullName: dto.contactName.trim(),
              displayName: dto.contactName.trim(),
              avatarUrl: SELLER_DEFAULT_AVATAR,
            },
          ],
          { session },
        );

        const [shop] = await this.shopModel.create(
          [
            {
              owner: user._id,
              name: dto.shopName.trim(),
              slug,
              description: dto.description?.trim() || undefined,
              category: dto.category?.trim() || undefined,
              businessType: dto.businessType as BusinessType,
              taxCode: dto.taxCode?.trim() || undefined,
              contactName: dto.contactName.trim(),
              contactPhone: dto.contactPhone.trim(),
              pickupAddress: {
                street: dto.street?.trim(),
                ward: dto.ward?.trim(),
                wardCode: dto.wardCode,
                province: dto.city?.trim(),
                // Mã tỉnh + toạ độ là đầu ĐI khi tính cước vận chuyển.
                provinceCode: dto.provinceCode,
                lat: dto.lat,
                lng: dto.lng,
                country: dto.country?.trim() || 'Việt Nam',
              },
              logoUrl: dto.logoUrl || SHOP_DEFAULT_LOGO,
              logoOriginalUrl: dto.logoOriginalUrl,
              logoCrop: dto.logoCrop,
              // Chọn logo riêng ngay ở bước đăng ký cũng tính là đã làm xong.
              logoSetAt: isCustomLogo(dto.logoUrl) ? new Date() : undefined,
              // Bán được ngay; admin chỉ đình chỉ khi vi phạm chính sách.
              status: 'active',
            },
          ],
          { session },
        );
        shopId = String(shop._id);
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException(
          'Email, số điện thoại hoặc shop đã tồn tại.',
        );
      }
      this.logger.error('Đăng ký người bán thất bại', err as Error);
      throw new InternalServerErrorException(
        'Không thể tạo shop. Vui lòng thử lại.',
      );
    } finally {
      await session.endSession();
    }

    if (!google) {
      this.auth.consumeVerified(email ? 'email' : 'phone', (email ?? phone) as string);
    }

    // Vừa xác thực OTP/Google xong → đăng nhập luôn, không bắt đăng nhập lại
    // (giống luồng mở shop cho tài khoản sẵn có).
    const sessionData = await this.issueSession(createdUser as UserDocument);
    return { ...sessionData, shopId };
  }

  /**
   * Mở gian hàng cho một tài khoản ĐÃ đăng nhập (buyer → seller).
   * Nhận diện user qua access token trong cookie. Tạo Shop (pending) + thêm role
   * `seller`, rồi cấp lại phiên để token mới mang role seller.
   */
  /**
   * Xác thực access token trong cookie → user hiện tại.
   * Public để `JwtAuthGuard` dùng chung, tránh có 2 bản kiểm token khác nhau.
   */
  async userFromAccessToken(accessToken?: string): Promise<UserDocument> {
    if (!accessToken) {
      throw new UnauthorizedException('Bạn cần đăng nhập để thực hiện thao tác này.');
    }

    let payload: { sub: string; tv?: number };
    try {
      payload = this.jwt.verify<{ sub: string; tv?: number }>(accessToken);
    } catch {
      throw new UnauthorizedException(
        'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
      );
    }

    const user = await this.userModel.findById(payload.sub);
    if (!user) throw new UnauthorizedException('Tài khoản không tồn tại.');
    // Token đã bị thu hồi (đổi mật khẩu / đăng xuất mọi thiết bị).
    if ((user.tokenVersion ?? 0) !== (payload.tv ?? 0)) {
      throw new UnauthorizedException(
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      );
    }
    return user;
  }

  /** Gian hàng của user hiện tại (null nếu chưa mở shop). */
  async getMyShop(accessToken?: string) {
    const user = await this.userFromAccessToken(accessToken);
    const shop = await this.shopModel.findOne({ owner: user._id });
    if (!shop) return { shop: null };
    return {
      shop: {
        id: String(shop._id),
        name: shop.name,
        slug: shop.slug,
        logoUrl: shop.logoUrl,
        status: shop.status,
        suspendedUntil: shop.suspendedUntil,
        description: shop.description,
        category: shop.category,
        businessType: shop.businessType,
        taxCode: shop.taxCode,
        // Liên hệ của GIAN HÀNG — khác với email/SĐT đăng nhập của tài khoản.
        contactName: shop.contactName,
        contactPhone: shop.contactPhone,
        contactEmail: shop.contactEmail,
        preparationDays: shop.preparationDays,
        vacationMode: shop.vacationMode,
        returnPolicy: shop.returnPolicy,
        pickupAddress: {
          street: shop.pickupAddress?.street,
          ward: shop.pickupAddress?.ward,
          wardCode: shop.pickupAddress?.wardCode,
          province: shop.pickupAddress?.province,
          provinceCode: shop.pickupAddress?.provinceCode,
          lat: shop.pickupAddress?.lat,
          lng: shop.pickupAddress?.lng,
          country: shop.pickupAddress?.country,
        },
        // null = đổi tên được ngay; có giá trị ở tương lai = đang trong 30 ngày chờ.
        nameChangeAvailableAt:
          this.nameChangeAvailableAt(shop)?.toISOString() ?? null,
        setup: {
          // `logoSetAt` chỉ có từ khi thêm cột này; shop cũ suy ra từ logo hiện tại.
          logoDone: !!shop.logoSetAt || isCustomLogo(shop.logoUrl),
          hasBank: !!shop.bankAccount,
          doneAt: shop.setupDoneAt?.toISOString() ?? null,
        },
      },
    };
  }

  /**
   * Đánh dấu đã hoàn tất checklist "Hoàn thiện gian hàng" (chỉ ghi lần đầu).
   *
   * Cố tình KHÔNG kiểm lại từng bước ở server: cờ này chỉ quyết định có hiện
   * một tấm thẻ hướng dẫn hay không. Gọi khống thì người bán tự giấu bảng
   * hướng dẫn của chính mình — không đụng tới tiền, đơn hay quyền gì cả.
   */
  async markSetupDone(accessToken?: string) {
    const user = await this.userFromAccessToken(accessToken);
    const shop = await this.shopModel.findOneAndUpdate(
      { owner: user._id, setupDoneAt: { $exists: false } },
      { $set: { setupDoneAt: new Date() } },
      { new: true },
    );
    // Không khớp = đã đánh dấu từ trước (hoặc chưa có shop) → coi như xong.
    return { ok: true, doneAt: shop?.setupDoneAt?.toISOString() ?? null };
  }

  /**
   * Thời điểm sớm nhất được đổi tên shop lần tiếp theo.
   * null = chưa từng đổi → đổi được ngay (tránh khoá oan người vừa tạo shop).
   */
  private nameChangeAvailableAt(shop: ShopDocument): Date | null {
    if (!shop.nameChangedAt) return null;
    return new Date(
      shop.nameChangedAt.getTime() + NAME_CHANGE_COOLDOWN_DAYS * 86_400_000,
    );
  }

  /** Cập nhật thông tin gian hàng. Chỉ áp dụng các trường được gửi lên. */
  async updateShop(accessToken: string | undefined, dto: UpdateShopDto) {
    const user = await this.userFromAccessToken(accessToken);
    const shop = await this.shopModel.findOne({ owner: user._id });
    if (!shop) throw new NotFoundException('Tài khoản này chưa có gian hàng.');

    // --- Tên shop: tối đa 1 lần / 30 ngày ---
    if (dto.name !== undefined && dto.name !== shop.name) {
      const availableAt = this.nameChangeAvailableAt(shop);
      if (availableAt && availableAt.getTime() > Date.now()) {
        const days = Math.ceil((availableAt.getTime() - Date.now()) / 86_400_000);
        throw new BadRequestException(
          `Tên shop chỉ được đổi 1 lần mỗi ${NAME_CHANGE_COOLDOWN_DAYS} ngày. Vui lòng thử lại sau ${days} ngày.`,
        );
      }
      shop.name = dto.name;
      shop.nameChangedAt = new Date();
    }

    // --- SĐT liên hệ: đổi số thì phải xác thực OTP (giống lúc mở shop) ---
    if (dto.contactPhone !== undefined) {
      const next = normalizePhone(dto.contactPhone);
      if (next !== normalizePhone(shop.contactPhone)) {
        const isOwnVerifiedPhone =
          !!user.phone && user.phone === next && user.phoneVerified;
        if (
          !isOwnVerifiedPhone &&
          !this.auth.isVerified('phone', dto.contactPhone)
        ) {
          throw new BadRequestException(
            'Vui lòng xác thực số điện thoại mới bằng mã OTP.',
          );
        }
        shop.contactPhone = dto.contactPhone;
        if (!isOwnVerifiedPhone) {
          this.auth.consumeVerified('phone', dto.contactPhone);
        }
      }
    }

    // --- Loại hình KD ↔ mã số thuế phải khớp nhau ---
    if (dto.businessType !== undefined || dto.taxCode !== undefined) {
      const businessType = (dto.businessType ??
        shop.businessType) as BusinessType;
      const taxCode =
        dto.taxCode !== undefined ? dto.taxCode.trim() : shop.taxCode;

      if (businessType !== 'personal' && !taxCode) {
        throw new BadRequestException(
          'Hộ kinh doanh và doanh nghiệp bắt buộc có mã số thuế/GPKD.',
        );
      }
      shop.businessType = businessType;
      // Cá nhân thì không giữ mã số thuế cho khỏi lệch dữ liệu.
      shop.taxCode = businessType === 'personal' ? undefined : taxCode;
    }

    // --- Các trường còn lại: chuỗi rỗng = xoá giá trị ---
    if (dto.description !== undefined) {
      shop.description = dto.description.trim() || undefined;
    }
    if (dto.category !== undefined) {
      shop.category = dto.category.trim() || undefined;
    }
    if (dto.contactName !== undefined) shop.contactName = dto.contactName;
    if (dto.contactEmail !== undefined) {
      shop.contactEmail = dto.contactEmail.trim().toLowerCase() || undefined;
    }
    if (dto.returnPolicy !== undefined) {
      shop.returnPolicy = dto.returnPolicy.trim() || undefined;
    }
    if (dto.preparationDays !== undefined) {
      shop.preparationDays = dto.preparationDays;
    }
    if (dto.vacationMode !== undefined) shop.vacationMode = dto.vacationMode;

    // --- Địa chỉ lấy hàng ---
    if (
      dto.street !== undefined ||
      dto.ward !== undefined ||
      dto.city !== undefined ||
      dto.country !== undefined
    ) {
      // Đổi tỉnh/thành thì mã phường và toạ độ cũ chắc chắn không còn đúng —
      // giữ lại sẽ tính cước theo một nơi khác hẳn địa chỉ đang hiển thị.
      const provinceChanged =
        dto.city !== undefined &&
        dto.city.trim() !== (shop.pickupAddress?.province ?? '');

      shop.pickupAddress = {
        street: dto.street?.trim() ?? shop.pickupAddress?.street,
        ward: dto.ward?.trim() ?? shop.pickupAddress?.ward,
        wardCode: dto.wardCode ?? (provinceChanged ? undefined : shop.pickupAddress?.wardCode),
        province: dto.city?.trim() ?? shop.pickupAddress?.province,
        provinceCode: dto.provinceCode ?? (provinceChanged ? undefined : shop.pickupAddress?.provinceCode),
        lat: dto.lat ?? (provinceChanged ? undefined : shop.pickupAddress?.lat),
        lng: dto.lng ?? (provinceChanged ? undefined : shop.pickupAddress?.lng),
        country: dto.country?.trim() || shop.pickupAddress?.country || 'Việt Nam',
      };
    }

    await shop.save();
    return { ok: true };
  }

  /** Đổi logo gian hàng của user hiện tại. */
  async updateShopLogo(
    accessToken: string | undefined,
    dto: UpdateShopLogoDto,
  ) {
    const user = await this.userFromAccessToken(accessToken);
    const shop = await this.shopModel.findOne({ owner: user._id });
    if (!shop) {
      throw new NotFoundException('Tài khoản này chưa có gian hàng.');
    }

    shop.logoUrl = dto.logoUrl;
    // Ảnh gốc/crop chỉ có khi user tự tải ảnh lên; quay về logo mặc định thì xoá.
    shop.logoOriginalUrl = dto.logoOriginalUrl;
    shop.logoCrop = dto.logoCrop;
    // Chỉ ghi lần đầu và không bao giờ xoá: đây là mốc "đã từng đặt logo riêng",
    // không phải cờ "hiện đang có logo riêng".
    if (isCustomLogo(dto.logoUrl) && !shop.logoSetAt) shop.logoSetAt = new Date();
    await shop.save();

    return { ok: true, logoUrl: shop.logoUrl };
  }

  async openShop(accessToken: string | undefined, dto: OpenShopDto) {
    const user = await this.userFromAccessToken(accessToken);

    if (await this.shopModel.exists({ owner: user._id })) {
      throw new ConflictException('Tài khoản này đã có gian hàng.');
    }

    // SĐT liên hệ phải được xác thực OTP — TRỪ KHI đúng là SĐT tài khoản đã
    // đăng nhập (vốn đã xác thực). Tài khoản đăng nhập bằng email/Google (chưa
    // có SĐT) hoặc nhập số khác đều phải xác thực tại chỗ.
    const contactE164 = normalizePhone(dto.contactPhone);
    const isOwnVerifiedPhone =
      !!user.phone && user.phone === contactE164 && user.phoneVerified;
    if (!isOwnVerifiedPhone && !this.auth.isVerified('phone', dto.contactPhone)) {
      throw new BadRequestException(
        'Vui lòng xác thực số điện thoại liên hệ bằng mã OTP.',
      );
    }

    const slug = await this.uniqueShopSlug(dto.shopName);
    const session = await this.connection.startSession();
    let shopId: string | undefined;

    try {
      await session.withTransaction(async () => {
        const [shop] = await this.shopModel.create(
          [
            {
              owner: user._id,
              name: dto.shopName.trim(),
              slug,
              description: dto.description?.trim() || undefined,
              category: dto.category?.trim() || undefined,
              businessType: dto.businessType as BusinessType,
              taxCode: dto.taxCode?.trim() || undefined,
              contactName: dto.contactName.trim(),
              contactPhone: dto.contactPhone.trim(),
              pickupAddress: {
                street: dto.street?.trim(),
                ward: dto.ward?.trim(),
                wardCode: dto.wardCode,
                province: dto.city?.trim(),
                // Mã tỉnh + toạ độ là đầu ĐI khi tính cước vận chuyển.
                provinceCode: dto.provinceCode,
                lat: dto.lat,
                lng: dto.lng,
                country: dto.country?.trim() || 'Việt Nam',
              },
              logoUrl: dto.logoUrl || SHOP_DEFAULT_LOGO,
              logoOriginalUrl: dto.logoOriginalUrl,
              logoCrop: dto.logoCrop,
              // Chọn logo riêng ngay ở bước đăng ký cũng tính là đã làm xong.
              logoSetAt: isCustomLogo(dto.logoUrl) ? new Date() : undefined,
              // Bán được ngay; admin chỉ đình chỉ khi vi phạm chính sách.
              status: 'active',
            },
          ],
          { session },
        );
        shopId = String(shop._id);

        if (!user.roles.includes('seller')) {
          user.roles = [...user.roles, 'seller'];
        }
        await user.save({ session });
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException('Gian hàng đã tồn tại.');
      }
      this.logger.error('Mở gian hàng thất bại', err as Error);
      throw new InternalServerErrorException(
        'Không thể mở gian hàng. Vui lòng thử lại.',
      );
    } finally {
      await session.endSession();
    }

    // Đã dùng OTP để mở shop → xoá cờ verified (một-lần).
    if (!isOwnVerifiedPhone) this.auth.consumeVerified('phone', dto.contactPhone);

    // Cấp lại phiên: token mới mang role seller để client vào được Kênh Người Bán.
    const sessionData = await this.issueSession(user);
    return { ...sessionData, shopId };
  }

  /** Tạo slug shop không trùng: chuẩn hoá bỏ dấu, thêm hậu tố -2, -3… nếu đụng. */
  private async uniqueShopSlug(name: string): Promise<string> {
    const base =
      name
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '') // bỏ dấu tổ hợp
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32) || 'shop';

    let slug = base;
    for (let i = 2; await this.shopModel.exists({ slug }); i++) {
      slug = `${base}-${i}`;
    }
    return slug;
  }

  /** Đăng nhập bằng email + mật khẩu. */
  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }
    // Tài khoản không có mật khẩu = đăng ký bằng Google/SĐT → sai phương thức.
    if (!user.passwordHash) {
      const viaGoogle = user.authProviders?.some((p) => p.provider === 'google');
      throw new UnauthorizedException(
        viaGoogle
          ? 'Tài khoản này đăng ký bằng Google. Vui lòng dùng "Tiếp tục với Google" để đăng nhập.'
          : 'Tài khoản này không dùng mật khẩu. Vui lòng đăng nhập bằng OTP số điện thoại.',
      );
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }
    return this.issueSession(user);
  }

  /** Đăng nhập bằng SĐT + OTP (tài khoản SĐT không dùng mật khẩu). */
  async loginWithPhone(dto: LoginPhoneDto) {
    const status = this.auth.verifyOtp('phone', dto.phone, dto.code);
    if (status !== 'success') {
      throw new UnauthorizedException(OTP_VERIFY_MESSAGES[status]);
    }
    // Mã đã dùng cho đăng nhập → xoá cờ verified để không dùng lại cho đăng ký.
    this.auth.consumeVerified('phone', dto.phone);

    const phone = normalizePhone(dto.phone);
    const user = await this.userModel.findOne({ phone });
    if (!user) {
      throw new UnauthorizedException('Số điện thoại này chưa được đăng ký.');
    }
    return this.issueSession(user);
  }

  /**
   * Cấp lại phiên từ refresh token trong cookie (khi access token hết hạn).
   * Xoay vòng cả cặp token; từ chối nếu refresh token đã hết hạn/bị thu hồi.
   */
  async refreshSession(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException('Phiên đăng nhập đã kết thúc.');
    }

    let payload: { sub: string; type?: string; tv?: number };
    try {
      payload = this.jwt.verify<{ sub: string; type?: string; tv?: number }>(
        refreshToken,
      );
    } catch {
      throw new UnauthorizedException(
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      );
    }

    // Chỉ chấp nhận refresh token — chặn dùng access token để gia hạn.
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token không hợp lệ.');
    }

    const user = await this.userModel.findById(payload.sub);
    if (!user) throw new UnauthorizedException('Tài khoản không tồn tại.');
    // Đã đổi mật khẩu / đăng xuất mọi thiết bị → token cũ mất hiệu lực.
    if ((user.tokenVersion ?? 0) !== (payload.tv ?? 0)) {
      throw new UnauthorizedException(
        'Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.',
      );
    }

    // Gia hạn không phải là đăng nhập mới → không đụng lastLoginAt.
    return this.issueSession(user, false);
  }

  /** Cập nhật lastLogin + phát access/refresh token và thông tin user. */
  private async issueSession(user: UserDocument, touchLogin = true) {
    if (touchLogin) {
      user.lastLoginAt = new Date();
      await user.save();
    }

    const profile = await this.profileModel.findOne({
      user: user._id as Types.ObjectId,
    });
    const sub = String(user._id);

    // `tv` = tokenVersion: guard (khi làm) so khớp để vô hiệu token cũ sau khi
    // đổi mật khẩu / đăng xuất mọi thiết bị.
    const tv = user.tokenVersion ?? 0;

    return {
      accessToken: this.jwt.sign(
        { sub, email: user.email, roles: user.roles, tv },
        { expiresIn: config.jwt.accessExpires },
      ),
      refreshToken: this.jwt.sign(
        { sub, type: 'refresh', tv },
        { expiresIn: config.jwt.refreshExpires },
      ),
      user: {
        id: sub,
        email: user.email,
        phone: user.phone,
        fullName: profile?.fullName,
        username: profile?.username,
        avatarUrl: profile?.avatarUrl,
        roles: user.roles,
      },
    };
  }
}
