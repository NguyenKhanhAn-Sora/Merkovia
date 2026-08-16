import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryAuditLogDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Tìm theo email admin, tên hành động, đối tượng bị tác động, hoặc nội dung chi tiết. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
