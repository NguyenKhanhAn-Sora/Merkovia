import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PlatformSettings,
  PlatformSettingsDocument,
} from './schemas/platform-settings.schema';
import { UpdatePlatformSettingsDto } from './dto/platform-settings.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';

export interface PlatformSettingsSnapshot {
  commissionRate: number;
  payoutHoldDays: number;
  returnWindowDays: number;
  reviewEditWindowHours: number;
  orderConfirmHours: number;
  orderConfirmWarnHours: number;
  orderShipHours: number;
  orderShipWarnHours: number;
  reportUrgentScore: number;
  reportHighScore: number;
  reportMediumScore: number;
}

/**
 * Giá trị mặc định — ĐÚNG bằng các mốc từng hardcode qua biến môi trường
 * trong `config.ts` trước đợt này, để không có cú nhảy chính sách bất ngờ lúc
 * triển khai tính năng này. Cũng là mẫu để `getOrCreateDoc()` tạo bản ghi đầu.
 */
export const DEFAULT_PLATFORM_SETTINGS: PlatformSettingsSnapshot = {
  commissionRate: 0.05,
  payoutHoldDays: 3,
  returnWindowDays: 7,
  reviewEditWindowHours: 48,
  orderConfirmHours: 48,
  orderConfirmWarnHours: 36,
  orderShipHours: 72,
  orderShipWarnHours: 48,
  reportUrgentScore: 4,
  reportHighScore: 2.2,
  reportMediumScore: 1,
};

/** Hoa hồng đổi quá mức này trong MỘT lần lưu sẽ bị chặn — chống gõ nhầm số 0. */
const MAX_COMMISSION_STEP = 0.02;

/**
 * Cấu hình chính sách toàn sàn — dùng chung bởi `PayoutService`,
 * `OrdersService`, `PaymentService`, `ReviewsService`, `ShopReportsService`
 * (thay cho đọc thẳng `config.*` trước đây).
 *
 * 🔴 `get()` phải ĐỒNG BỘ: các nơi gọi đang ở giữa luồng nghiệp vụ không
 * `await` được (vd tính hạn ngay trong lúc dựng object đơn hàng), nên giữ
 * cache trong bộ nhớ, nạp lại ngay sau mỗi lần admin lưu — cùng kiến trúc với
 * `TableShippingProvider`.
 */
@Injectable()
export class PlatformSettingsService implements OnModuleInit {
  private readonly logger = new Logger(PlatformSettingsService.name);
  private snapshot: PlatformSettingsSnapshot = DEFAULT_PLATFORM_SETTINGS;

  constructor(
    @InjectModel(PlatformSettings.name)
    private readonly model: Model<PlatformSettingsDocument>,
    private readonly auditLog: AuditLogService,
  ) {}

  async onModuleInit() {
    await this.refreshFromDb();
  }

  /** Đọc đồng bộ — dùng ở mọi nơi cần tính hạn/tỉ lệ ngay trong luồng nghiệp vụ. */
  get(): PlatformSettingsSnapshot {
    return this.snapshot;
  }

  async refreshFromDb(): Promise<void> {
    try {
      const doc = await this.model.findOne().lean();
      if (!doc) return; // chưa có bản ghi nào — giữ nguyên mặc định
      this.snapshot = {
        commissionRate: doc.commissionRate,
        payoutHoldDays: doc.payoutHoldDays,
        returnWindowDays: doc.returnWindowDays,
        reviewEditWindowHours: doc.reviewEditWindowHours,
        orderConfirmHours: doc.orderConfirmHours,
        orderConfirmWarnHours: doc.orderConfirmWarnHours,
        orderShipHours: doc.orderShipHours,
        orderShipWarnHours: doc.orderShipWarnHours,
        reportUrgentScore: doc.reportUrgentScore,
        reportHighScore: doc.reportHighScore,
        reportMediumScore: doc.reportMediumScore,
      };
    } catch (err: unknown) {
      this.logger.warn(`Không nạp lại được cấu hình sàn, giữ cache cũ: ${String(err)}`);
    }
  }

  private async getOrCreateDoc(): Promise<PlatformSettingsDocument> {
    const existing = await this.model.findOne();
    if (existing) return existing;
    return this.model.create(DEFAULT_PLATFORM_SETTINGS);
  }

  async adminGet() {
    const doc = await this.getOrCreateDoc();
    return this.shape(doc);
  }

  async adminUpdate(admin: AdminPrincipal, dto: UpdatePlatformSettingsDto) {
    if (dto.orderConfirmWarnHours >= dto.orderConfirmHours) {
      throw new BadRequestException(
        'Mốc nhắc xác nhận đơn phải nhỏ hơn hạn xác nhận đơn — nếu không đơn bị huỷ mà chưa từng được nhắc.',
      );
    }
    if (dto.orderShipWarnHours >= dto.orderShipHours) {
      throw new BadRequestException(
        'Mốc nhắc bàn giao vận chuyển phải nhỏ hơn hạn bàn giao — nếu không đơn bị huỷ mà chưa từng được nhắc.',
      );
    }
    if (!(dto.reportUrgentScore >= dto.reportHighScore && dto.reportHighScore >= dto.reportMediumScore)) {
      throw new BadRequestException(
        'Ngưỡng điểm báo cáo phải giảm dần: khẩn cấp ≥ cao ≥ trung bình.',
      );
    }

    const before = await this.getOrCreateDoc();
    const rateStep = Math.abs(dto.commissionRate - before.commissionRate);
    if (rateStep > MAX_COMMISSION_STEP) {
      throw new BadRequestException(
        `Mỗi lần chỉ được đổi hoa hồng tối đa ${(MAX_COMMISSION_STEP * 100).toFixed(0)} điểm phần trăm ` +
          `(đang đổi từ ${(before.commissionRate * 100).toFixed(1)}% sang ${(dto.commissionRate * 100).toFixed(1)}%) — ` +
          'chia thành nhiều lần lưu nếu thực sự cần đổi nhiều, để tránh gõ nhầm gây thiệt hại lớn.',
      );
    }

    const beforeShaped = this.shape(before);

    before.commissionRate = dto.commissionRate;
    before.payoutHoldDays = dto.payoutHoldDays;
    before.returnWindowDays = dto.returnWindowDays;
    before.reviewEditWindowHours = dto.reviewEditWindowHours;
    before.orderConfirmHours = dto.orderConfirmHours;
    before.orderConfirmWarnHours = dto.orderConfirmWarnHours;
    before.orderShipHours = dto.orderShipHours;
    before.orderShipWarnHours = dto.orderShipWarnHours;
    before.reportUrgentScore = dto.reportUrgentScore;
    before.reportHighScore = dto.reportHighScore;
    before.reportMediumScore = dto.reportMediumScore;
    before.updatedBy = admin.email;
    await before.save();

    // Áp dụng ngay cho luồng nghiệp vụ tiếp theo — không cần khởi động lại server.
    await this.refreshFromDb();

    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Cập nhật cấu hình sàn',
      detail: diffSummary(beforeShaped, this.shape(before)),
    });

    return this.shape(before);
  }

  private shape(doc: PlatformSettingsDocument) {
    return {
      commissionRate: doc.commissionRate,
      payoutHoldDays: doc.payoutHoldDays,
      returnWindowDays: doc.returnWindowDays,
      reviewEditWindowHours: doc.reviewEditWindowHours,
      orderConfirmHours: doc.orderConfirmHours,
      orderConfirmWarnHours: doc.orderConfirmWarnHours,
      orderShipHours: doc.orderShipHours,
      orderShipWarnHours: doc.orderShipWarnHours,
      reportUrgentScore: doc.reportUrgentScore,
      reportHighScore: doc.reportHighScore,
      reportMediumScore: doc.reportMediumScore,
      updatedBy: doc.updatedBy,
      updatedAt: (doc as unknown as { updatedAt?: Date }).updatedAt,
    };
  }
}

/** Tóm tắt phần thực sự đổi cho nhật ký admin. */
function diffSummary(
  before: ReturnType<PlatformSettingsService['shape']>,
  after: ReturnType<PlatformSettingsService['shape']>,
): string {
  const FIELD_LABEL: Record<string, string> = {
    commissionRate: 'Hoa hồng',
    payoutHoldDays: 'Số ngày giữ tiền',
    returnWindowDays: 'Hạn trả hàng (ngày)',
    reviewEditWindowHours: 'Hạn sửa đánh giá (giờ)',
    orderConfirmHours: 'Hạn xác nhận đơn (giờ)',
    orderConfirmWarnHours: 'Mốc nhắc xác nhận (giờ)',
    orderShipHours: 'Hạn bàn giao vận chuyển (giờ)',
    orderShipWarnHours: 'Mốc nhắc bàn giao (giờ)',
    reportUrgentScore: 'Ngưỡng khẩn cấp',
    reportHighScore: 'Ngưỡng cao',
    reportMediumScore: 'Ngưỡng trung bình',
  };
  const parts: string[] = [];
  for (const key of Object.keys(FIELD_LABEL) as (keyof typeof FIELD_LABEL)[]) {
    const b = before[key as keyof typeof before];
    const a = after[key as keyof typeof after];
    if (b !== a) {
      const fmt = (v: unknown) =>
        key === 'commissionRate' ? `${(Number(v) * 100).toFixed(1)}%` : String(v);
      parts.push(`${FIELD_LABEL[key]}: ${fmt(b)} → ${fmt(a)}`);
    }
  }
  return parts.length ? parts.join('; ') : 'Không có thay đổi giá trị.';
}
