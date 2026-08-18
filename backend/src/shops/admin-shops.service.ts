import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Shop, ShopDocument } from './schemas/shop.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ShopSuspensionService } from '../shop-reports/shop-suspension.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../auth/mail.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import type { QueryAdminShopsDto } from './dto/admin-shops.dto';

/**
 * Quản lý gian hàng CHUNG trong Kênh Quản trị — khác `ShopReportsModule` (chỉ
 * xử lý shop đang bị buyer TỐ CÁO). Ở đây admin đình chỉ/gỡ TRỰC TIẾP, không
 * cần report làm căn cứ (vd tự phát hiện vi phạm, yêu cầu pháp lý).
 */
@Injectable()
export class AdminShopsService {
  private readonly logger = new Logger(AdminShopsService.name);

  constructor(
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly suspension: ShopSuspensionService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(query: QueryAdminShopsDto) {
    const tab = query.tab ?? 'all';
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const match: Record<string, unknown> = {};
    if (tab !== 'all') match.status = tab;
    if (query.q?.trim()) {
      const rx = new RegExp(
        query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      match.$or = [{ name: rx }, { slug: rx }];
    }

    const [items, total, counts] = await Promise.all([
      this.shopModel
        .find(match)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('name slug status businessType suspendedUntil createdAt')
        .lean(),
      this.shopModel.countDocuments(match),
      this.countByTab(),
    ]);

    return {
      items: items.map((s) => ({
        id: String(s._id),
        name: s.name,
        slug: s.slug,
        status: s.status,
        businessType: s.businessType,
        suspendedUntil: s.suspendedUntil,
        createdAt: (s as { createdAt?: Date }).createdAt,
      })),
      total,
      page,
      limit,
      counts,
    };
  }

  private async countByTab() {
    const [all, active, suspended, pending] = await Promise.all([
      this.shopModel.countDocuments({}),
      this.shopModel.countDocuments({ status: 'active' }),
      this.shopModel.countDocuments({ status: 'suspended' }),
      this.shopModel.countDocuments({ status: 'pending' }),
    ]);
    return { all, active, suspended, pending };
  }

  async detail(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy gian hàng.');
    }
    const shop = await this.shopModel.findById(id).lean();
    if (!shop) throw new NotFoundException('Không tìm thấy gian hàng.');

    const owner = await this.userModel
      .findById(shop.owner)
      .select('email phone')
      .lean();

    return {
      id: String(shop._id),
      name: shop.name,
      slug: shop.slug,
      status: shop.status,
      businessType: shop.businessType,
      taxCode: shop.taxCode,
      contactName: shop.contactName,
      contactPhone: shop.contactPhone,
      contactEmail: shop.contactEmail,
      vacationMode: shop.vacationMode,
      suspendedUntil: shop.suspendedUntil,
      createdAt: (shop as { createdAt?: Date }).createdAt,
      owner: owner ? { email: owner.email, phone: owner.phone } : undefined,
    };
  }

  /** Đình chỉ trực tiếp — dùng chung cơ chế lên lịch/thông báo với `ShopReportsService.resolve`. */
  async suspend(
    admin: AdminPrincipal,
    shopId: string,
    reason: string,
    suspendDays?: number,
  ) {
    if (!Types.ObjectId.isValid(shopId)) {
      throw new NotFoundException('Không tìm thấy gian hàng.');
    }

    // Atomic: điều kiện "chưa bị đình chỉ" nằm trong filter, tránh 2 tab admin
    // cùng đình chỉ một shop trong cùng khoảnh khắc đọc trùng nhau.
    const unsuspendAt = suspendDays
      ? new Date(Date.now() + suspendDays * 86_400_000)
      : null;
    const shop = await this.shopModel.findOneAndUpdate(
      { _id: shopId, status: { $ne: 'suspended' } },
      { $set: { status: 'suspended', suspendedUntil: unsuspendAt } },
      { new: true },
    );
    if (!shop) {
      const exists = await this.shopModel.exists({ _id: shopId });
      if (!exists) throw new NotFoundException('Không tìm thấy gian hàng.');
      throw new BadRequestException('Gian hàng này đã bị đình chỉ rồi.');
    }
    if (suspendDays) {
      await this.suspension.schedule(shopId, unsuspendAt as Date);
    } else {
      await this.suspension.cancel(shopId);
    }

    const durationText = suspendDays
      ? `trong ${suspendDays} ngày (tự động hoạt động lại sau khi hết hạn)`
      : 'cho đến khi được xem xét lại';
    await this.notifications.notifyUser(shop.owner, 'seller', {
      type: 'shop_report_suspended',
      title: 'Gian hàng của bạn đã bị tạm đình chỉ',
      body: `Quản trị viên đã tạm đình chỉ gian hàng "${shop.name}" ${durationText}. Lý do: ${reason}`,
      link: '/settings',
    });

    const owner = await this.userModel
      .findById(shop.owner)
      .select('email')
      .lean();
    if (owner?.email) {
      await this.mail
        .sendShopViolationNotice(owner.email, {
          shopName: shop.name,
          action: 'suspend',
          reasons: 'Quyết định trực tiếp từ quản trị viên',
          note: suspendDays
            ? `${reason} (Thời hạn: ${suspendDays} ngày)`
            : reason,
        })
        .catch((e: unknown) =>
          this.logger.warn(
            `Gửi email đình chỉ gian hàng thất bại: ${String(e)}`,
          ),
        );
    }

    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Đình chỉ gian hàng (trực tiếp)',
      targetLabel: shop.name,
      detail: reason,
    });

    return { ok: true };
  }

  async unsuspend(admin: AdminPrincipal, shopId: string) {
    if (!Types.ObjectId.isValid(shopId)) {
      throw new NotFoundException('Không tìm thấy gian hàng.');
    }

    const shop = await this.shopModel.findOneAndUpdate(
      { _id: shopId, status: 'suspended' },
      { $set: { status: 'active', suspendedUntil: null } },
      { new: true },
    );
    if (!shop) {
      const exists = await this.shopModel.exists({ _id: shopId });
      if (!exists) throw new NotFoundException('Không tìm thấy gian hàng.');
      throw new BadRequestException('Gian hàng này hiện không bị đình chỉ.');
    }
    await this.suspension.cancel(shopId);

    await this.notifications.notifyUser(shop.owner, 'seller', {
      type: 'shop_suspension_lifted',
      title: 'Gian hàng của bạn đã được gỡ đình chỉ',
      body: `Quản trị viên đã gỡ đình chỉ cho gian hàng "${shop.name}". Gian hàng đã hoạt động trở lại bình thường.`,
      link: '/settings',
    });

    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Gỡ đình chỉ gian hàng (trực tiếp)',
      targetLabel: shop.name,
    });

    return { ok: true };
  }
}
