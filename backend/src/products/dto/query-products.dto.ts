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

/** Bộ lọc danh sách sản phẩm trong Kênh Người Bán. */
export class QueryProductsDto {
  /** all = mọi trạng thái; out = còn hàng = 0. */
  /** `deleted` = xem thùng rác (sản phẩm đã xoá, còn hạn khôi phục). */
  @IsOptional()
  @IsIn(['all', 'draft', 'active', 'hidden', 'out', 'deleted'])
  status?: string;

  /** Từ khoá — so khớp trên chuỗi đã bỏ dấu. */
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

  @IsOptional()
  @IsIn(['newest', 'oldest', 'price_asc', 'price_desc', 'sold', 'stock'])
  sort?: string;
}
