import { Type } from 'class-transformer';
import { IsInt, Min, ValidateNested } from 'class-validator';

export class ZoneRateDto {
  @Type(() => Number)
  @IsInt({ message: 'Cước cơ bản phải là số nguyên.' })
  @Min(0, { message: 'Cước cơ bản không được âm.' })
  base: number;

  @Type(() => Number)
  @IsInt({ message: 'Phụ phí mỗi 500g phải là số nguyên.' })
  @Min(0, { message: 'Phụ phí mỗi 500g không được âm.' })
  perHalfKg: number;

  @Type(() => Number)
  @IsInt({ message: 'Số ngày giao tối thiểu phải là số nguyên.' })
  @Min(0, { message: 'Số ngày giao tối thiểu không được âm.' })
  etaMinDays: number;

  @Type(() => Number)
  @IsInt({ message: 'Số ngày giao tối đa phải là số nguyên.' })
  @Min(0, { message: 'Số ngày giao tối đa không được âm.' })
  etaMaxDays: number;
}

/** Sửa biểu cước toàn sàn — luôn phải gửi đủ cả 3 vùng, không sửa lẻ từng vùng. */
export class UpdateShippingSettingsDto {
  @ValidateNested()
  @Type(() => ZoneRateDto)
  intra_province: ZoneRateDto;

  @ValidateNested()
  @Type(() => ZoneRateDto)
  inter_province: ZoneRateDto;

  @ValidateNested()
  @Type(() => ZoneRateDto)
  long_haul: ZoneRateDto;

  @Type(() => Number)
  @IsInt({ message: 'Ngưỡng miễn phí vận chuyển phải là số nguyên.' })
  @Min(0, { message: 'Ngưỡng miễn phí vận chuyển không được âm.' })
  freeShippingThreshold: number;

  @Type(() => Number)
  @IsInt({ message: 'Ngưỡng tuyến xa phải là số nguyên.' })
  @Min(1, { message: 'Ngưỡng tuyến xa phải lớn hơn 0.' })
  longHaulKm: number;
}
