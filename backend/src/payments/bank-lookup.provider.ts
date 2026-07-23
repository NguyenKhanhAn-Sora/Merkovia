import { Injectable, Logger } from '@nestjs/common';
import { deaccent } from '../common/text';

/**
 * Kết quả tra cứu chủ tài khoản ngân hàng.
 *
 * `ok: false` KHÔNG phải lỗi hệ thống — nghĩa là tài khoản không tồn tại hoặc
 * ngân hàng từ chối trả lời. Lỗi mạng/hạ tầng thì ném exception để tầng trên
 * phân biệt được "số sai" với "dịch vụ đang hỏng".
 */
export interface BankLookupResult {
  ok: boolean;
  /** Tên chủ tài khoản do ngân hàng trả về (viết hoa không dấu, như thực tế). */
  accountHolderName?: string;
  /** Lý do đọc được cho người dùng khi `ok: false`. */
  reason?: string;
}

/**
 * Cổng tra cứu tài khoản ngân hàng.
 *
 * Tách thành lớp trừu tượng để đổi nhà cung cấp mà không đụng nghiệp vụ. Khi
 * có giấy phép kinh doanh và API key thật, chỉ cần viết một lớp con mới
 * (bankHub / SePay / payOS…) rồi đổi provider trong module — service, DTO và
 * toàn bộ giao diện giữ nguyên.
 */
export abstract class BankLookupProvider {
  abstract lookup(
    bankBin: string,
    accountNumber: string,
  ): Promise<BankLookupResult>;

  /** Nhà cung cấp đang dùng — hiển thị ở giao diện để biết đang chạy giả lập. */
  abstract readonly name: string;
  /** `false` = dữ liệu giả lập, giao diện phải cảnh báo rõ cho người bán. */
  abstract readonly isReal: boolean;
}

/* ------------------------------------------------------------------ *
 *  Bản giả lập cho môi trường phát triển.
 * ------------------------------------------------------------------ */

const HO = ['NGUYEN', 'TRAN', 'LE', 'PHAM', 'HOANG', 'VU', 'DANG', 'BUI'];
const DEM = ['VAN', 'THI', 'HUU', 'DUC', 'MINH', 'NGOC', 'THANH', 'QUOC'];
const TEN = [
  'AN',
  'BINH',
  'CUONG',
  'DUNG',
  'HA',
  'KHANH',
  'LINH',
  'MAI',
  'NAM',
  'SON',
];

/**
 * Tra cứu giả lập — KHÔNG gọi ra ngoài.
 *
 * Hai tính chất quan trọng để dùng được:
 *  1. **Tất định**: cùng số tài khoản luôn ra cùng một tên. Nếu random thì
 *     người bán xác thực lại lần hai sẽ thấy tên khác, không test được gì.
 *  2. **Có đường thất bại**: số kết thúc bằng "0000" coi như không tồn tại, để
 *     thử được nhánh lỗi mà không cần chờ nhà cung cấp thật.
 */
@Injectable()
export class MockBankLookupProvider extends BankLookupProvider {
  readonly name = 'Giả lập (môi trường phát triển)';
  readonly isReal = false;

  private readonly logger = new Logger(MockBankLookupProvider.name);

  async lookup(
    bankBin: string,
    accountNumber: string,
  ): Promise<BankLookupResult> {
    // Giả lập độ trễ mạng để giao diện lộ ra trạng thái đang tải.
    await new Promise((r) => setTimeout(r, 400));

    this.logger.warn(
      `Đang dùng tra cứu ngân hàng GIẢ LẬP cho ${bankBin}/${accountNumber}.`,
    );

    if (accountNumber.endsWith('0000')) {
      return {
        ok: false,
        reason: 'Không tìm thấy tài khoản. Vui lòng kiểm tra lại số tài khoản.',
      };
    }

    // Băm CÓ TÍNH VỊ TRÍ (kiểu FNV-1a). Nếu chỉ cộng tổng chữ số thì hai số
    // đảo chữ nhau — 1234567890 và 9876543210 — sẽ ra cùng một tên, khiến bản
    // giả lập không phân biệt được tài khoản khác nhau.
    let h = 0x811c9dc5;
    for (const ch of `${bankBin}:${accountNumber}`) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }

    const name = [
      HO[h % HO.length],
      DEM[(h >>> 8) % DEM.length],
      TEN[(h >>> 16) % TEN.length],
    ].join(' ');

    return { ok: true, accountHolderName: name };
  }
}

/* ------------------------------------------------------------------ *
 *  So khớp tên
 * ------------------------------------------------------------------ */

/**
 * So tên chủ tài khoản với tên người đại diện của shop.
 *
 * Ngân hàng trả tên VIẾT HOA KHÔNG DẤU nên phải chuẩn hoá cả hai vế. Trả về
 * `false` KHÔNG chặn người bán — tài khoản công ty hoặc tài khoản người thân
 * là hợp lệ trong thực tế; chỉ dùng để cảnh báo và cho admin soi sau này.
 */
export function nameMatches(holderName: string, contactName: string): boolean {
  const norm = (s: string) =>
    deaccent(s).toUpperCase().replace(/\s+/g, ' ').trim();
  return norm(holderName) === norm(contactName);
}
