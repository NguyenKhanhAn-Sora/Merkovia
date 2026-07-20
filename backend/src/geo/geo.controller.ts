import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { GeoService } from './geo.service';

@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('provinces')
  provinces() {
    return this.geo.getProvinces();
  }

  @Get('provinces/:code/wards')
  wards(@Param('code', ParseIntPipe) code: number) {
    return this.geo.getWards(code);
  }
}
