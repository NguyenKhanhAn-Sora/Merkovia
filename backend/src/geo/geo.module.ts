import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { PlacesService } from './places.service';

@Module({
  controllers: [GeoController],
  providers: [GeoService, PlacesService],
  exports: [PlacesService],
})
export class GeoModule {}
