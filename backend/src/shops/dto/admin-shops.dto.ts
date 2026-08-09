import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QueryAdminShopsDto {
  @IsOptional()
  @IsIn(['all', 'active', 'suspended', 'pending'])
  tab?: 'all' | 'active' | 'suspended' | 'pending';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(100)
  @Min(1)
  limit?: number;
}

/** Đình chỉ trực tiếp — KHÔNG qua report, dùng khi admin tự phát hiện vi phạm hoặc theo yêu cầu pháp lý. */
export class SuspendShopDto {
  @IsString()
  @MinLength(5, { message: 'Vui lòng nêu lý do đình chỉ (ít nhất 5 ký tự).' })
  @MaxLength(500)
  reason: string;

  /** Để trống = đình chỉ vô thời hạn. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  suspendDays?: number;
}
