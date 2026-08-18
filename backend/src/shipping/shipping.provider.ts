import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ShippingSettings,
  ShippingSettingsDocument,
} from './schemas/shipping-settings.schema';

/** Một đầu của tuyến vận chuyển (kho người bán hoặc địa chỉ người nhận). */
export interface ShippingPoint {
  provinceCode?: number;
  wardCode?: number;
  lat?: number;
  lng?: number;
}

export interface ShippingQuoteInput {
  from: ShippingPoint;
  to: ShippingPoint;
  /** Khối lượng tính cước (gram) — đã lấy max giữa thực tế và quy đổi. */
  weightGram: number;
  /** Tiền hàng, dùng cho ngưỡng miễn phí vận chuyển. */
  itemsTotal: number;
}

/**
 * Vùng cước. Cố ý chỉ có ba mức và chỉ khẳng định `long_haul` khi CHỨNG MINH
 * được bằng toạ độ — thiếu dữ liệu thì xếp vào mức giữa, không đoán bừa theo
 * hướng có lợi cho sàn.
 */
export type ShippingZone = 'intra_province' | 'inter_province' | 'long_haul';

export interface ShippingQuote {
  /** Số tiền người mua trả (đã áp miễn phí nếu đủ điều kiện). */
  fee: number;
  /** Cước gốc trước khi miễn phí — để hiển thị "tiết kiệm X đ". */
  baseFee: number;
  discount: number;
  freeShipping: boolean;
  zone: ShippingZone;
  weightGram: number;
  /** Khoảng cách đường chim bay (km) nếu đủ toạ độ. */
  distanceKm?: number;
  etaDays: { min: number; max: number };
  /** Tên dịch vụ hiển thị cho người mua. */
  serviceName: string;
}

/**
 * Đơn vị tính cước vận chuyển.
 *
 * Tách trừu tượng để sau này nối GHN/GHTK/Viettel Post mà không đụng nghiệp vụ
 * đơn hàng. Bản mặc định dùng biểu cước riêng của sàn — đây là cách làm thật
 * của nhiều sàn nhỏ, KHÔNG phải dữ liệu giả: công thức, biểu giá và quy đổi
 * khối lượng đều theo chuẩn ngành.
 */
export abstract class ShippingProvider {
  abstract readonly name: string;
  /** `false` = biểu cước nội bộ, chưa nối hãng vận chuyển thật. */
  abstract readonly isCarrier: boolean;

  abstract quote(input: ShippingQuoteInput): ShippingQuote;
}

/* ------------------------------------------------------------------ *
 *  Biểu cước nội bộ
 * ------------------------------------------------------------------ */

/** Cước cơ bản cho 1kg đầu + phụ phí mỗi 500g tiếp theo, theo từng vùng. */
export type ShippingRatesTable = Record<
  ShippingZone,
  { base: number; perHalfKg: number; eta: { min: number; max: number } }
>;

export interface ShippingRatesSnapshot {
  rates: ShippingRatesTable;
  freeShippingThreshold: number;
  longHaulKm: number;
}

/**
 * Giá trị mặc định — dùng khi CHƯA có bản ghi `ShippingSettings` nào trong DB
 * (lần chạy đầu) và làm mẫu để `ShippingSettingsService` khởi tạo bản ghi đầu
 * tiên. Đây chính là biểu cước cũ từng hardcode ở đây — giữ nguyên số liệu để
 * không có cú nhảy giá bất ngờ nào ngay lúc triển khai tính năng này.
 */
export const DEFAULT_SHIPPING_RATES: ShippingRatesSnapshot = {
  rates: {
    intra_province: { base: 16_500, perHalfKg: 5_000, eta: { min: 1, max: 2 } },
    inter_province: { base: 30_000, perHalfKg: 8_000, eta: { min: 2, max: 4 } },
    long_haul: { base: 40_000, perHalfKg: 12_000, eta: { min: 3, max: 6 } },
  },
  freeShippingThreshold: 500_000,
  longHaulKm: 500,
};

/** Khối lượng đã gồm trong cước cơ bản — hằng số kỹ thuật, KHÔNG cho admin sửa (xem ghi chú ở `ShippingSettingsService`). */
const INCLUDED_GRAM = 1_000;

/** Hệ số quy đổi khối lượng theo thể tích (chuẩn chuyển phát đường bộ) — hằng số kỹ thuật, KHÔNG cho admin sửa. */
export const VOLUMETRIC_DIVISOR = 6_000;

@Injectable()
export class TableShippingProvider extends ShippingProvider implements OnModuleInit {
  readonly name = 'Biểu cước Merkovia';
  readonly isCarrier = false;
  private readonly logger = new Logger(TableShippingProvider.name);

  /**
   * Cache trong bộ nhớ — `quote()` phải luôn ĐỒNG BỘ (được gọi trực tiếp
   * trong luồng đặt hàng, không `await` được) nên không thể đọc DB mỗi lần
   * tính cước. Khởi tạo sẵn bằng giá trị mặc định để `quote()` không bao giờ
   * rơi vào trạng thái chưa có dữ liệu, kể cả trước khi `onModuleInit` chạy
   * xong hay khi DB tạm thời lỗi.
   */
  private snapshot: ShippingRatesSnapshot = DEFAULT_SHIPPING_RATES;

  constructor(
    @InjectModel(ShippingSettings.name)
    private readonly settingsModel: Model<ShippingSettingsDocument>,
  ) {
    super();
  }

  async onModuleInit() {
    await this.refreshFromDb();
  }

  /**
   * Nạp lại cache từ DB — gọi lúc khởi động VÀ ngay sau mỗi lần admin lưu
   * biểu cước mới, để thay đổi có hiệu lực tức thì, không cần khởi động lại
   * server. Đọc lỗi thì GIỮ NGUYÊN cache cũ (không để một đợt lỗi DB thoáng
   * qua làm luồng đặt hàng đang chạy tốt bỗng dưng vỡ).
   */
  async refreshFromDb(): Promise<void> {
    try {
      const doc = await this.settingsModel.findOne().lean();
      if (!doc) return; // chưa có bản ghi nào — giữ nguyên mặc định
      this.applySnapshot(doc);
    } catch (err: unknown) {
      this.logger.warn(`Không nạp lại được biểu cước, giữ cache cũ: ${String(err)}`);
    }
  }

  /**
   * Gán thẳng cache từ một document đã có trong tay (VD vừa `save()` xong) —
   * KHÔNG đọc lại DB. `ShippingSettingsService.adminUpdate` dùng cách này thay
   * vì gọi `refreshFromDb()` để tránh race: đọc lại độc lập có thể hoàn tất
   * KHÔNG theo đúng thứ tự các lần lưu khi 2 admin lưu gần nhau, khiến cache
   * bị ghi đè ngược về giá trị cũ hơn dữ liệu thật trong DB.
   */
  applySnapshot(doc: {
    intra_province: { base: number; perHalfKg: number; etaMinDays: number; etaMaxDays: number };
    inter_province: { base: number; perHalfKg: number; etaMinDays: number; etaMaxDays: number };
    long_haul: { base: number; perHalfKg: number; etaMinDays: number; etaMaxDays: number };
    freeShippingThreshold: number;
    longHaulKm: number;
  }): void {
    this.snapshot = {
      rates: {
        intra_province: zoneToRate(doc.intra_province),
        inter_province: zoneToRate(doc.inter_province),
        long_haul: zoneToRate(doc.long_haul),
      },
      freeShippingThreshold: doc.freeShippingThreshold,
      longHaulKm: doc.longHaulKm,
    };
  }

  quote(input: ShippingQuoteInput): ShippingQuote {
    const { rates, freeShippingThreshold, longHaulKm } = this.snapshot;
    const distanceKm = haversineKm(input.from, input.to);
    const zone = resolveZone(input.from, input.to, distanceKm, longHaulKm);
    const rate = rates[zone];

    // Làm tròn LÊN theo mốc 500g: hãng vận chuyển nào cũng tính vậy, và làm
    // tròn xuống sẽ khiến sàn bù lỗ ở mọi đơn lẻ.
    const extraGram = Math.max(0, input.weightGram - INCLUDED_GRAM);
    const extraUnits = Math.ceil(extraGram / 500);
    const raw = rate.base + extraUnits * rate.perHalfKg;

    // Làm tròn tới 500đ cho số tiền dễ đọc, giống bảng giá thực tế.
    const baseFee = Math.round(raw / 500) * 500;

    const freeShipping = input.itemsTotal >= freeShippingThreshold;
    const discount = freeShipping ? baseFee : 0;

    return {
      fee: baseFee - discount,
      baseFee,
      discount,
      freeShipping,
      zone,
      weightGram: input.weightGram,
      distanceKm: distanceKm ?? undefined,
      etaDays: rate.eta,
      serviceName: 'Giao hàng tiêu chuẩn',
    };
  }
}

/* ------------------------------- Tiện ích ------------------------------- */

/**
 * Xác định vùng cước.
 *
 * Thứ tự kiểm tra quan trọng: cùng tỉnh là chắc chắn nhất nên xét trước;
 * chỉ khi có toạ độ CẢ HAI đầu mới dám kết luận tuyến xa. Không có gì để dựa
 * thì trả về mức giữa — thà tính đúng mức phổ biến còn hơn đoán sai hai đầu.
 */
export function resolveZone(
  from: ShippingPoint,
  to: ShippingPoint,
  distanceKm: number | null,
  longHaulKm: number = DEFAULT_SHIPPING_RATES.longHaulKm,
): ShippingZone {
  if (
    from.provinceCode != null &&
    to.provinceCode != null &&
    from.provinceCode === to.provinceCode
  ) {
    return 'intra_province';
  }
  if (distanceKm != null) {
    // Có toạ độ nhưng thiếu mã tỉnh: rất gần thì vẫn coi là nội tỉnh.
    if (distanceKm < 30 && from.provinceCode == null) return 'intra_province';
    return distanceKm >= longHaulKm ? 'long_haul' : 'inter_province';
  }
  return 'inter_province';
}

/** Khoảng cách đường chim bay (km); `null` nếu thiếu toạ độ một trong hai đầu. */
export function haversineKm(
  a: ShippingPoint,
  b: ShippingPoint,
): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
    return null;
  }
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/**
 * Khối lượng tính cước của một kiện.
 *
 * Hãng vận chuyển tính theo số LỚN HƠN giữa khối lượng thật và khối lượng quy
 * đổi từ thể tích — nếu chỉ dùng khối lượng thật thì một thùng xốp to mà nhẹ
 * sẽ được tính rẻ như một gói nhỏ, và sàn lỗ phần chênh.
 */
export function chargeableWeight(item: {
  weightGram?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}): number {
  const actual = item.weightGram ?? 500;
  const { lengthCm, widthCm, heightCm } = item;
  if (!lengthCm || !widthCm || !heightCm) return actual;

  const volumetric = Math.round(
    ((lengthCm * widthCm * heightCm) / VOLUMETRIC_DIVISOR) * 1000,
  );
  return Math.max(actual, volumetric);
}

/**
 * Hằng số kỹ thuật CỐ ĐỊNH, không nằm trong biểu cước admin sửa được — theo
 * chuẩn ngành vận chuyển đường bộ, không phải đòn bẩy kinh doanh. Xuất ra để
 * trang quản trị hiển thị (chỉ đọc) cho admin biết hệ thống đang quy đổi thế
 * nào, tránh nhầm tưởng đây cũng là số có thể chỉnh.
 */
export const SHIPPING_CONSTANTS = {
  INCLUDED_GRAM,
  VOLUMETRIC_DIVISOR,
};

/** Chuyển subdocument DB (`ShippingZoneRate`) sang định dạng nội bộ của cache. */
function zoneToRate(z: { base: number; perHalfKg: number; etaMinDays: number; etaMaxDays: number }) {
  return { base: z.base, perHalfKg: z.perHalfKg, eta: { min: z.etaMinDays, max: z.etaMaxDays } };
}
