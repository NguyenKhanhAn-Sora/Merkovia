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

/** Bộ lọc duyệt sản phẩm phía người mua (công khai, không cần đăng nhập). */
export class BrowseProductsDto {
  /** Từ khoá — so khớp trên chuỗi đã bỏ dấu. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** Slug hoặc id danh mục; lọc cả nhánh con. */
  @IsOptional()
  @IsString()
  @MaxLength(90)
  category?: string;

  /** Chỉ lấy hàng của một gian hàng (dùng cho trang shop). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  shop?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  /** Chỉ lấy sản phẩm có điểm đánh giá trung bình >= ngưỡng này (1-5 sao). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  minRating?: number;

  @IsOptional()
  @IsIn(['newest', 'price_asc', 'price_desc', 'popular', 'rating'])
  sort?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  limit?: number;
}
