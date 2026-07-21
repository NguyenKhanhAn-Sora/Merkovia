import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { config } from '../config/config';

export interface PlaceSuggestion {
  placeId: string;
  /** Dòng chính, thường là số nhà + tên đường. */
  main: string;
  /** Phần còn lại của địa chỉ (phường, tỉnh…). */
  secondary: string;
  description: string;
}

export interface PlaceDetail {
  placeId: string;
  address: string;
  lat: number;
  lng: number;
}

/* Hình dạng phản hồi của Goong (tương thích Google Places). */
interface GoongAutocompleteRes {
  predictions?: {
    place_id: string;
    description: string;
    structured_formatting?: {
      main_text?: string;
      secondary_text?: string;
    };
  }[];
}
interface GoongDetailRes {
  result?: {
    place_id?: string;
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
  };
}

/**
 * Gợi ý địa chỉ chi tiết và lấy toạ độ, qua Goong Maps.
 *
 * Vì sao gọi ở SERVER chứ không gọi thẳng từ trình duyệt: API key nằm trong
 * bundle client là ai cũng lấy được và đốt hết hạn mức của mình.
 *
 * Khi chưa cấu hình key, mọi hàm ở đây trả kết quả RỖNG chứ không ném lỗi và
 * cũng không bịa dữ liệu — giao diện tự lùi về ô nhập tay như trước. Sinh gợi
 * ý giả sẽ khiến người dùng tin là địa chỉ đã được kiểm chứng, tệ hơn hẳn việc
 * không có gợi ý.
 */
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);

  get enabled(): boolean {
    return !!config.goong.apiKey;
  }

  get info() {
    return { enabled: this.enabled, provider: this.enabled ? 'Goong' : null };
  }

  private async call<T>(path: string, params: Record<string, string>): Promise<T> {
    const query = new URLSearchParams({
      ...params,
      api_key: config.goong.apiKey,
    });
    try {
      const res = await fetch(`${config.goong.baseUrl}${path}?${query}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`upstream trả ${res.status}`);
      return (await res.json()) as T;
    } catch (e: unknown) {
      this.logger.warn(`Gọi Goong thất bại (${path}): ${String(e)}`);
      throw new HttpException(
        'Không kết nối được dịch vụ gợi ý địa chỉ.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Gợi ý địa chỉ theo từ khoá.
   *
   * `location` là toạ độ để ưu tiên kết quả gần đó — người mua ở Hà Nội gõ
   * "nguyễn trãi" thì nên ra Nguyễn Trãi Hà Nội trước, không phải TP.HCM.
   */
  async autocomplete(
    input: string,
    location?: { lat: number; lng: number },
  ): Promise<PlaceSuggestion[]> {
    const q = input.trim();
    // Dưới 3 ký tự thì gợi ý vô nghĩa mà vẫn tốn một lượt gọi tính phí.
    if (!this.enabled || q.length < 3) return [];

    const data = await this.call<GoongAutocompleteRes>('/Place/AutoComplete', {
      input: q,
      ...(location ? { location: `${location.lat},${location.lng}` } : {}),
    });

    return (data.predictions ?? []).slice(0, 8).map((p) => ({
      placeId: p.place_id,
      main: p.structured_formatting?.main_text ?? p.description,
      secondary: p.structured_formatting?.secondary_text ?? '',
      description: p.description,
    }));
  }

  /** Chi tiết một gợi ý — đây là chỗ lấy được toạ độ. */
  async detail(placeId: string): Promise<PlaceDetail | null> {
    if (!this.enabled) return null;

    const data = await this.call<GoongDetailRes>('/Place/Detail', {
      place_id: placeId,
    });
    const loc = data.result?.geometry?.location;
    if (!loc) return null;

    return {
      placeId: data.result?.place_id ?? placeId,
      address: data.result?.formatted_address ?? '',
      lat: loc.lat,
      lng: loc.lng,
    };
  }
}
