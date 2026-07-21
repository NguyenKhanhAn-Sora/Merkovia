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
  /**
   * Đơn vị hành chính tại điểm đó, nếu nhà cung cấp trả về.
   * Dùng để cảnh báo khi người dùng ghim vào một tỉnh khác với tỉnh họ đã
   * chọn — sai tỉnh là sai luôn cước vận chuyển và có khi không giao được.
   */
  compound?: { province?: string; district?: string; commune?: string };
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
interface GoongGeocodeRes {
  results?: {
    place_id?: string;
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
    compound?: { province?: string; district?: string; commune?: string };
  }[];
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
    return {
      enabled: this.enabled,
      provider: this.enabled ? 'Goong' : null,
      /**
       * Bản đồ tương tác cần khoá RIÊNG (maptiles) do trình duyệt gọi thẳng,
       * khác khoá REST chỉ dùng ở server. Thiếu khoá này thì nút "Chọn trên
       * bản đồ" tự ẩn — gợi ý gõ chữ vẫn dùng bình thường.
       */
      mapEnabled: !!config.goong.mapTilesKey,
      mapStyleUrl: config.goong.mapTilesKey
        ? `${config.goong.mapStyleUrl}?api_key=${config.goong.mapTilesKey}`
        : null,
    };
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

  /**
   * Toạ độ → địa chỉ (reverse geocoding).
   *
   * Đây là thứ làm nên tính năng "chọn vị trí trên bản đồ": người dùng kéo bản
   * đồ tới đúng nhà mình, hệ thống tự điền địa chỉ. Cần cho các địa chỉ mà gõ
   * chữ không ra — hẻm sâu, nhà trong ngõ, chung cư mới.
   */
  async reverse(lat: number, lng: number): Promise<PlaceDetail | null> {
    if (!this.enabled) return null;

    const data = await this.call<GoongGeocodeRes>('/Geocode', {
      latlng: `${lat},${lng}`,
    });
    const first = data.results?.[0];
    if (!first) return null;

    return {
      placeId: first.place_id ?? '',
      address: first.formatted_address ?? '',
      // Trả lại đúng toạ độ người dùng đã chọn, KHÔNG lấy toạ độ của kết quả:
      // họ ghim đúng cửa nhà mình, còn kết quả có thể là tâm cả con đường.
      lat,
      lng,
      compound: first.compound,
    };
  }

  /**
   * Địa chỉ → toạ độ (geocoding thuận).
   * Dùng để mở bản đồ đúng khu vực người dùng đã chọn thay vì rơi giữa Việt Nam.
   */
  async geocode(address: string): Promise<{ lat: number; lng: number } | null> {
    if (!this.enabled || !address.trim()) return null;

    const data = await this.call<GoongGeocodeRes>('/Geocode', {
      address: address.trim(),
    });
    const loc = data.results?.[0]?.geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
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
