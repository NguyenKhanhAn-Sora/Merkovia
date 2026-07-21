import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { GeoService } from './geo.service';
import { PlacesService } from './places.service';

class AutocompleteDto {
  @IsString()
  @MaxLength(150)
  q: string;

  /** Toạ độ để ưu tiên kết quả gần người dùng. */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}

class ReverseDto {
  @Type(() => Number)
  @IsLatitude({ message: 'Vĩ độ không hợp lệ.' })
  lat: number;

  @Type(() => Number)
  @IsLongitude({ message: 'Kinh độ không hợp lệ.' })
  lng: number;
}

class LocateDto {
  @IsString({ message: 'Địa chỉ không hợp lệ.' })
  @MaxLength(200, { message: 'Địa chỉ quá dài.' })
  address: string;
}

@Controller('geo')
export class GeoController {
  constructor(
    private readonly geo: GeoService,
    private readonly places: PlacesService,
  ) {}

  @Get('provinces')
  provinces() {
    return this.geo.getProvinces();
  }

  @Get('provinces/:code/wards')
  wards(@Param('code', ParseIntPipe) code: number) {
    return this.geo.getWards(code);
  }

  /** Giao diện hỏi trước để biết có bật ô gợi ý địa chỉ hay không. */
  @Get('places/status')
  status() {
    return this.places.info;
  }

  /**
   * Gợi ý địa chỉ chi tiết.
   * Siết tần suất vì mỗi lượt gọi là một lượt tính phí với nhà cung cấp, và
   * người dùng gõ liên tục sẽ bắn rất nhiều request nếu client quên debounce.
   */
  @Get('places/autocomplete')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async autocomplete(@Query() query: AutocompleteDto) {
    const location =
      query.lat != null && query.lng != null
        ? { lat: query.lat, lng: query.lng }
        : undefined;
    return {
      suggestions: await this.places.autocomplete(query.q, location),
      enabled: this.places.enabled,
    };
  }

  /**
   * Toạ độ → địa chỉ. Dùng khi người dùng ghim vị trí trên bản đồ.
   * Đặt TRƯỚC `places/:placeId` để không bị route đó nuốt mất.
   */
  @Get('places/reverse')
  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  async reverse(@Query() query: ReverseDto) {
    return { place: await this.places.reverse(query.lat, query.lng) };
  }

  /** Địa chỉ → toạ độ, để mở bản đồ đúng khu vực đã chọn. */
  @Get('places/locate')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async locate(@Query() query: LocateDto) {
    return { location: await this.places.geocode(query.address) };
  }

  @Get('places/:placeId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async place(@Param('placeId') placeId: string) {
    return { place: await this.places.detail(placeId) };
  }
}
