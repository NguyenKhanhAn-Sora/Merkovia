import { Injectable } from '@nestjs/common';

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
const RATES: Record<
  ShippingZone,
  { base: number; perHalfKg: number; eta: { min: number; max: number } }
> = {
  intra_province: { base: 16_500, perHalfKg: 5_000, eta: { min: 1, max: 2 } },
  inter_province: { base: 30_000, perHalfKg: 8_000, eta: { min: 2, max: 4 } },
  long_haul: { base: 40_000, perHalfKg: 12_000, eta: { min: 3, max: 6 } },
};

/** Khối lượng đã gồm trong cước cơ bản. */
const INCLUDED_GRAM = 1_000;

/** Từ mốc này coi là tuyến xa (chỉ áp dụng khi biết toạ độ hai đầu). */
const LONG_HAUL_KM = 500;

/** Tiền hàng từ mức này trở lên thì miễn phí vận chuyển. */
const FREE_SHIPPING_THRESHOLD = 500_000;

/** Hệ số quy đổi khối lượng theo thể tích (chuẩn chuyển phát đường bộ). */
export const VOLUMETRIC_DIVISOR = 6_000;

@Injectable()
export class TableShippingProvider extends ShippingProvider {
  readonly name = 'Biểu cước Merkovia';
  readonly isCarrier = false;

  quote(input: ShippingQuoteInput): ShippingQuote {
    const distanceKm = haversineKm(input.from, input.to);
    const zone = resolveZone(input.from, input.to, distanceKm);
    const rate = RATES[zone];

    // Làm tròn LÊN theo mốc 500g: hãng vận chuyển nào cũng tính vậy, và làm
    // tròn xuống sẽ khiến sàn bù lỗ ở mọi đơn lẻ.
    const extraGram = Math.max(0, input.weightGram - INCLUDED_GRAM);
    const extraUnits = Math.ceil(extraGram / 500);
    const raw = rate.base + extraUnits * rate.perHalfKg;

    // Làm tròn tới 500đ cho số tiền dễ đọc, giống bảng giá thực tế.
    const baseFee = Math.round(raw / 500) * 500;

    const freeShipping = input.itemsTotal >= FREE_SHIPPING_THRESHOLD;
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
    return distanceKm >= LONG_HAUL_KM ? 'long_haul' : 'inter_province';
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

export const SHIPPING_CONSTANTS = {
  FREE_SHIPPING_THRESHOLD,
  INCLUDED_GRAM,
  LONG_HAUL_KM,
  VOLUMETRIC_DIVISOR,
};
