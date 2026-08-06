import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Bộ lọc hàng đợi kiểm duyệt sản phẩm trong Kênh Quản trị. */
export class QueryAdminProductsDto {
  @IsOptional()
  @IsIn(['pending', 'rejected', 'ok', 'all'])
  tab?: 'pending' | 'rejected' | 'ok' | 'all';

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
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Admin duyệt/từ chối tay — dùng bất cứ lúc nào, kể cả ghi đè quyết định AI. */
export class ModerateProductDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  /** Bắt buộc khi `action: 'reject'` — service tự kiểm tra, không validate ở DTO vì phụ thuộc `action`. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
