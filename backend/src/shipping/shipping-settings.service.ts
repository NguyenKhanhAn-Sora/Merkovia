import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ShippingSettings,
  ShippingSettingsDocument,
} from './schemas/shipping-settings.schema';
import {
  DEFAULT_SHIPPING_RATES,
  SHIPPING_CONSTANTS,
  TableShippingProvider,
} from './shipping.provider';
import { UpdateShippingSettingsDto, ZoneRateDto } from './dto/shipping-settings.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';

const ZONE_LABEL: Record<'intra_province' | 'inter_province' | 'long_haul', string> = {
  intra_province: 'Nội tỉnh',
  inter_province: 'Liên tỉnh',
  long_haul: 'Tuyến xa',
};

/**
 * Quản trị biểu cước vận chuyển toàn sàn — CHỈ một bản ghi `ShippingSettings`
 * duy nhất (singleton), tự tạo với giá trị mặc định (bằng đúng biểu cước cũ
 * từng hardcode) nếu chưa tồn tại.
 */
@Injectable()
export class ShippingSettingsService {
  constructor(
    @InjectModel(ShippingSettings.name)
    private readonly settingsModel: Model<ShippingSettingsDocument>,
    private readonly provider: TableShippingProvider,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Lấy bản ghi duy nhất, tạo mới bằng giá trị mặc định nếu đây là lần đầu. */
  private async getOrCreateDoc(): Promise<ShippingSettingsDocument> {
    const existing = await this.settingsModel.findOne();
    if (existing) return existing;
    return this.settingsModel.create({
      intra_province: fromDefaultZone(DEFAULT_SHIPPING_RATES.rates.intra_province),
      inter_province: fromDefaultZone(DEFAULT_SHIPPING_RATES.rates.inter_province),
      long_haul: fromDefaultZone(DEFAULT_SHIPPING_RATES.rates.long_haul),
      freeShippingThreshold: DEFAULT_SHIPPING_RATES.freeShippingThreshold,
      longHaulKm: DEFAULT_SHIPPING_RATES.longHaulKm,
    });
  }

  /** Trang "Vận chuyển" của Kênh Quản trị — biểu cước hiện hành + hằng số kỹ thuật chỉ-đọc. */
  async adminGet() {
    const doc = await this.getOrCreateDoc();
    return { settings: this.shape(doc), constants: SHIPPING_CONSTANTS };
  }

  async adminUpdate(admin: AdminPrincipal, dto: UpdateShippingSettingsDto) {
    for (const key of ['intra_province', 'inter_province', 'long_haul'] as const) {
      const z = dto[key];
      if (z.etaMinDays > z.etaMaxDays) {
        throw new BadRequestException(
          `Vùng "${ZONE_LABEL[key]}": số ngày giao tối thiểu không được lớn hơn tối đa.`,
        );
      }
    }

    const before = await this.getOrCreateDoc();
    const beforeShaped = this.shape(before);

    before.intra_province = toZoneDoc(dto.intra_province);
    before.inter_province = toZoneDoc(dto.inter_province);
    before.long_haul = toZoneDoc(dto.long_haul);
    before.freeShippingThreshold = dto.freeShippingThreshold;
    before.longHaulKm = dto.longHaulKm;
    before.updatedBy = admin.email;
    await before.save();

    // Áp dụng ngay cho những đơn đang tính cước tiếp theo — không cần khởi
    // động lại server. Đơn ĐÃ đặt giữ nguyên cước đã chốt (snapshot riêng
    // trên `Order`), nên đổi ở đây không ảnh hưởng ngược tới đơn cũ.
    await this.provider.refreshFromDb();

    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Cập nhật biểu cước vận chuyển',
      detail: diffSummary(beforeShaped, this.shape(before)),
    });

    return { settings: this.shape(before) };
  }

  private shape(doc: ShippingSettingsDocument) {
    return {
      intra_province: fromZoneDoc(doc.intra_province),
      inter_province: fromZoneDoc(doc.inter_province),
      long_haul: fromZoneDoc(doc.long_haul),
      freeShippingThreshold: doc.freeShippingThreshold,
      longHaulKm: doc.longHaulKm,
      updatedBy: doc.updatedBy,
      updatedAt: (doc as unknown as { updatedAt?: Date }).updatedAt,
    };
  }
}

function toZoneDoc(z: ZoneRateDto) {
  return {
    base: z.base,
    perHalfKg: z.perHalfKg,
    etaMinDays: z.etaMinDays,
    etaMaxDays: z.etaMaxDays,
  };
}

function fromZoneDoc(z: {
  base: number;
  perHalfKg: number;
  etaMinDays: number;
  etaMaxDays: number;
}) {
  return {
    base: z.base,
    perHalfKg: z.perHalfKg,
    etaMinDays: z.etaMinDays,
    etaMaxDays: z.etaMaxDays,
  };
}

/** Chuyển định dạng nội bộ `DEFAULT_SHIPPING_RATES` (`eta: {min,max}`) sang định dạng DB (`etaMinDays`/`etaMaxDays`). */
function fromDefaultZone(z: {
  base: number;
  perHalfKg: number;
  eta: { min: number; max: number };
}) {
  return {
    base: z.base,
    perHalfKg: z.perHalfKg,
    etaMinDays: z.eta.min,
    etaMaxDays: z.eta.max,
  };
}

/** Tóm tắt phần thực sự đổi cho nhật ký admin — không log nguyên khối JSON khó đọc. */
function diffSummary(
  before: ReturnType<ShippingSettingsService['shape']>,
  after: ReturnType<ShippingSettingsService['shape']>,
): string {
  const parts: string[] = [];
  for (const key of ['intra_province', 'inter_province', 'long_haul'] as const) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      parts.push(
        `${ZONE_LABEL[key]}: ${b.base.toLocaleString('vi-VN')}đ+${b.perHalfKg.toLocaleString('vi-VN')}đ/500g (${b.etaMinDays}-${b.etaMaxDays} ngày) → ${a.base.toLocaleString('vi-VN')}đ+${a.perHalfKg.toLocaleString('vi-VN')}đ/500g (${a.etaMinDays}-${a.etaMaxDays} ngày)`,
      );
    }
  }
  if (before.freeShippingThreshold !== after.freeShippingThreshold) {
    parts.push(
      `Ngưỡng freeship: ${before.freeShippingThreshold.toLocaleString('vi-VN')}đ → ${after.freeShippingThreshold.toLocaleString('vi-VN')}đ`,
    );
  }
  if (before.longHaulKm !== after.longHaulKm) {
    parts.push(`Ngưỡng tuyến xa: ${before.longHaulKm}km → ${after.longHaulKm}km`);
  }
  return parts.length ? parts.join('; ') : 'Không có thay đổi giá trị.';
}
