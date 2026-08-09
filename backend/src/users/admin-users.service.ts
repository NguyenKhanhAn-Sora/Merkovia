import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { Profile, ProfileDocument } from '../profiles/schemas/profile.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { ShopSuspensionService } from '../shop-reports/shop-suspension.service';
import { MailService } from '../auth/mail.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import type { LockScope, QueryAdminUsersDto } from './dto/admin-users.dto';

const SCOPE_LABEL: Record<LockScope, string> = {
  buyer: 'mua hàng',
  seller: 'bán hàng',
  all: 'toàn bộ tài khoản',
};

const LOCK_ACTION_LABEL: Record<LockScope, string> = {
  buyer: 'Cấm mua hàng',
  seller: 'Cấm bán hàng',
  all: 'Khoá toàn bộ tài khoản',
};

const UNLOCK_ACTION_LABEL: Record<LockScope, string> = {
  buyer: 'Gỡ cấm mua hàng',
  seller: 'Gỡ cấm bán hàng',
  all: 'Gỡ khoá toàn bộ tài khoản',
};

/**
 * Quản lý tài khoản người dùng (buyer + seller) trong Kênh Quản trị — khác
 * `ShopReportsModule` (chỉ xử lý gian hàng bị TỐ CÁO). Trang này cho admin
 * chủ động khoá một tài khoản vì lý do KHÔNG gắn với report nào (gian lận
 * đăng nhập, spam, yêu cầu pháp lý...).
 */
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    private readonly suspension: ShopSuspensionService,
    private readonly mail: MailService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(query: QueryAdminUsersDto) {
    const tab = query.tab ?? 'all';
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const match: Record<string, unknown> = { deletedAt: null };
    if (tab === 'buyer') match.roles = 'buyer';
    if (tab === 'seller') match.roles = 'seller';
    if (tab === 'locked') {
      match.$or = [
        { status: 'suspended' },
        { buyerLocked: true },
        { sellerLocked: true },
      ];
    }

    if (query.q?.trim()) {
      const q = query.q.trim();
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      match.$or = [{ email: rx }, { phone: rx }];
    }

    const [items, total, counts] = await Promise.all([
      this.userModel
        .find(match)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(match),
      this.countByTab(),
    ]);

    const userIds = items.map((u) => u._id);
    const [profiles, shops] = await Promise.all([
      this.profileModel
        .find({ user: { $in: userIds } })
        .select('user fullName displayName avatarUrl')
        .lean(),
      this.shopModel
        .find({ owner: { $in: userIds } })
        .select('owner name slug status')
        .lean(),
    ]);
    const profileByUser = new Map(profiles.map((p) => [String(p.user), p]));
    const shopByOwner = new Map(shops.map((s) => [String(s.owner), s]));

    return {
      items: items.map((u) => {
        const profile = profileByUser.get(String(u._id));
        const shop = shopByOwner.get(String(u._id));
        return {
          id: String(u._id),
          email: u.email,
          phone: u.phone,
          roles: u.roles,
          status: u.status,
          buyerLocked: u.buyerLocked,
          sellerLocked: u.sellerLocked,
          emailVerified: u.emailVerified,
          phoneVerified: u.phoneVerified,
          name: profile?.displayName || profile?.fullName,
          avatarUrl: profile?.avatarUrl,
          shop: shop
            ? { name: shop.name, slug: shop.slug, status: shop.status }
            : undefined,
          createdAt: (u as { createdAt?: Date }).createdAt,
          lastLoginAt: u.lastLoginAt,
        };
      }),
      total,
      page,
      limit,
      counts,
    };
  }

  private async countByTab() {
    const base = { deletedAt: null };
    const lockedMatch: Record<string, unknown> = {
      ...base,
      $or: [
        { status: 'suspended' },
        { buyerLocked: true },
        { sellerLocked: true },
      ],
    };
    const [all, buyer, seller, locked] = await Promise.all([
      this.userModel.countDocuments(base),
      this.userModel.countDocuments({ ...base, roles: 'buyer' }),
      this.userModel.countDocuments({ ...base, roles: 'seller' }),
      this.userModel.countDocuments(lockedMatch),
    ]);
    return { all, buyer, seller, locked };
  }

  async detail(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }
    const user = await this.userModel
      .findOne({ _id: id, deletedAt: null })
      .lean();
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');

    const [profile, shop] = await Promise.all([
      this.profileModel.findOne({ user: user._id }).lean(),
      this.shopModel.findOne({ owner: user._id }).lean(),
    ]);

    return {
      id: String(user._id),
      email: user.email,
      phone: user.phone,
      roles: user.roles,
      status: user.status,
      buyerLocked: user.buyerLocked,
      sellerLocked: user.sellerLocked,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      name: profile?.displayName || profile?.fullName,
      avatarUrl: profile?.avatarUrl,
      shop: shop
        ? {
            id: String(shop._id),
            name: shop.name,
            slug: shop.slug,
            status: shop.status,
          }
        : undefined,
      createdAt: (user as { createdAt?: Date }).createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  /**
   * Khoá tài khoản theo VAI TRÒ — có hiệu lực NGAY trên mọi phiên đã đăng
   * nhập (xem `AccountService.assertNotLocked`). `scope: 'buyer'` chỉ chặn
   * app người mua (giữ nguyên quyền bán); `'seller'` chỉ chặn app người bán
   * (giữ nguyên quyền mua); `'all'` chặn cả hai — dùng cho vấn đề DANH TÍNH
   * (gian lận đăng nhập, lộ mật khẩu, yêu cầu pháp lý), không phải vi phạm
   * riêng một vai trò.
   *
   * Đình chỉ gian hàng cascade CHỈ khi `scope` chặn được app seller (`seller`
   * hoặc `all`) — chủ shop không đăng nhập được thì không thể vận hành, để
   * shop "hiện active" mà không ai xử lý còn rủi ro hơn. Khoá vì lý do MUA
   * hàng (`scope: 'buyer'`) không đụng tới gian hàng — họ vẫn bán bình thường.
   */
  async lock(
    admin: AdminPrincipal,
    id: string,
    reason: string,
    scope: LockScope,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }
    const user = await this.userModel.findOne({ _id: id, deletedAt: null });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');

    const alreadyLocked =
      scope === 'all'
        ? user.status === 'suspended'
        : scope === 'buyer'
          ? user.buyerLocked
          : user.sellerLocked;
    if (alreadyLocked) {
      throw new BadRequestException(
        `Tài khoản này đã bị hạn chế "${SCOPE_LABEL[scope]}" rồi.`,
      );
    }

    if (scope === 'all') user.status = 'suspended';
    if (scope === 'buyer') user.buyerLocked = true;
    if (scope === 'seller') user.sellerLocked = true;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1; // thu hồi mọi phiên đang đăng nhập
    await user.save();

    if (
      (scope === 'seller' || scope === 'all') &&
      user.roles.includes('seller')
    ) {
      const shop = await this.shopModel.findOne({ owner: user._id });
      if (shop && shop.status !== 'suspended') {
        shop.status = 'suspended';
        shop.suspendedUntil = null;
        await shop.save();
        await this.suspension.cancel(String(shop._id));
        this.logger.log(
          `Khoá tài khoản (${scope}) ${id} → tự động đình chỉ gian hàng ${String(shop._id)}.`,
        );
      }
    }

    if (user.email) {
      await this.mail
        .sendAccountStatusNotice(user.email, {
          action: 'lock',
          scopeLabel: SCOPE_LABEL[scope],
          reason,
        })
        .catch((e: unknown) =>
          this.logger.warn(`Gửi email khoá tài khoản thất bại: ${String(e)}`),
        );
    }

    await this.auditLog.log({
      adminEmail: admin.email,
      action: LOCK_ACTION_LABEL[scope],
      targetLabel: user.email ?? user.phone ?? id,
      detail: reason,
    });

    return { ok: true };
  }

  /**
   * Gỡ khoá ĐÚNG scope đã khoá — KHÔNG tự động gỡ đình chỉ gian hàng (nếu có)
   * dù `scope` là `seller`/`all`, vì shop có thể đang bị đình chỉ vì một lý
   * do KHÁC (report riêng) — admin cần vào trang Gian hàng xem xét gỡ riêng.
   */
  async unlock(admin: AdminPrincipal, id: string, scope: LockScope) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }
    const user = await this.userModel.findOne({ _id: id, deletedAt: null });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản.');

    const isLocked =
      scope === 'all'
        ? user.status === 'suspended'
        : scope === 'buyer'
          ? user.buyerLocked
          : user.sellerLocked;
    if (!isLocked) {
      throw new BadRequestException(
        `Tài khoản này hiện không bị hạn chế "${SCOPE_LABEL[scope]}".`,
      );
    }

    if (scope === 'all') user.status = 'active';
    if (scope === 'buyer') user.buyerLocked = false;
    if (scope === 'seller') user.sellerLocked = false;
    await user.save();

    if (user.email) {
      await this.mail
        .sendAccountStatusNotice(user.email, {
          action: 'unlock',
          scopeLabel: SCOPE_LABEL[scope],
        })
        .catch((e: unknown) =>
          this.logger.warn(
            `Gửi email gỡ khoá tài khoản thất bại: ${String(e)}`,
          ),
        );
    }

    await this.auditLog.log({
      adminEmail: admin.email,
      action: UNLOCK_ACTION_LABEL[scope],
      targetLabel: user.email ?? user.phone ?? id,
    });

    return { ok: true };
  }
}
