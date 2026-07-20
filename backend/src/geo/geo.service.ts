import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export interface GeoItem {
  code: number;
  name: string;
}

interface ProvinceRaw {
  code: number;
  name: string;
}
interface ProvinceWithWards {
  wards?: { code: number; name: string }[];
}

/**
 * Proxy dữ liệu hành chính VN từ API miễn phí provinces.open-api.vn (v2,
 * cấu trúc 2 cấp: tỉnh/thành → phường/xã). Gọi phía server để tránh CORS,
 * và cache in-memory cho nhẹ.
 */
@Injectable()
export class GeoService {
  private readonly base = 'https://provinces.open-api.vn/api/v2';
  private provinces: GeoItem[] | null = null;
  private readonly wards = new Map<number, GeoItem[]>();

  /**
   * Gọi upstream có timeout + thử lại: API công cộng thỉnh thoảng lỗi nhất
   * thời, mà một lần hỏng là dropdown địa chỉ phía client rỗng. Luôn ném 502
   * (không để lọt lỗi lạ thành 500) kèm thông báo rõ ràng.
   */
  private async fetchJson<T>(url: string, message: string): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`upstream trả ${res.status}`);
        return (await res.json()) as T;
      } catch (err) {
        lastError = err;
        // Chờ ngắn tăng dần rồi thử lại (150ms, 400ms).
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, attempt * 250));
        }
      }
    }
    throw new HttpException(
      `${message} (${String(lastError)})`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  async getProvinces(): Promise<GeoItem[]> {
    if (this.provinces) return this.provinces;
    const data = await this.fetchJson<ProvinceRaw[]>(
      `${this.base}/?depth=1`,
      'Không tải được danh sách tỉnh/thành.',
    );
    this.provinces = data.map((p) => ({ code: p.code, name: p.name }));
    return this.provinces;
  }

  async getWards(provinceCode: number): Promise<GeoItem[]> {
    const cached = this.wards.get(provinceCode);
    if (cached) return cached;
    const data = await this.fetchJson<ProvinceWithWards>(
      `${this.base}/p/${provinceCode}?depth=2`,
      'Không tải được danh sách phường/xã.',
    );
    const wards = (data.wards ?? []).map((w) => ({ code: w.code, name: w.name }));
    this.wards.set(provinceCode, wards);
    return wards;
  }
}
