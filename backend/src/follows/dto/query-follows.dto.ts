import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class QueryFollowsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  limit?: number;

  /** Tìm nhanh trong số shop đã theo dõi, theo tên. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
