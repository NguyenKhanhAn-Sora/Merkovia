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

  @Get('places/:placeId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async place(@Param('placeId') placeId: string) {
    return { place: await this.places.detail(placeId) };
  }
}
