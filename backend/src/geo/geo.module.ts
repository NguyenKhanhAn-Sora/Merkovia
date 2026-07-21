import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { PlacesService } from './places.service';
import { GeoBackfillService } from './geo-backfill.service';
import { ShopsModule } from '../shops/shops.module';
import { AddressesModule } from '../addresses/addresses.module';

@Module({
  // Cần model Shop + Address để điền mã hành chính cho dữ liệu cũ.
  imports: [ShopsModule, AddressesModule],
  controllers: [GeoController],
  providers: [GeoService, PlacesService, GeoBackfillService],
  exports: [PlacesService, GeoService],
})
export class GeoModule {}
