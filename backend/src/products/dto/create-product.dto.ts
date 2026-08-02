import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { MAX_OPTION_TIERS } from '../schemas/product.schema';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class OptionTierDto {
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(30)
  name: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Mỗi nhóm phân loại cần ít nhất 1 giá trị.' })
  @ArrayMaxSize(30, { message: 'Mỗi nhóm phân loại tối đa 30 giá trị.' })
  @IsString({ each: true })
  values: string[];
}

export class VariantDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(50)
  sku?: string;

  /** Khớp thứ tự optionTiers; mảng rỗng nếu sản phẩm không phân loại. */
  @IsArray()
  @IsString({ each: true })
  optionValues: string[];

  // Tiền là số nguyên VND — không cho số thực để tránh sai lệch tiền.
  @Type(() => Number)
  @IsInt({ message: 'Giá phải là số nguyên (VND).' })
  @Min(0, { message: 'Giá không được âm.' })
  @Max(100_000_000_000, { message: 'Giá vượt quá giới hạn cho phép.' })
  price: number;

  @Type(() => Number)
  @IsInt({ message: 'Tồn kho phải là số nguyên.' })
  @Min(0, { message: 'Tồn kho không được âm.' })
  @Max(1_000_000)
  stock: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  image?: string;

  /**
   * Tổ hợp này có bán không. Dùng khi không phải mọi tổ hợp đều tồn tại
   * (vd: màu Đỏ chỉ có size 60). Tắt thì không tính vào giá/kho và người mua
   * không đặt được, nhưng vẫn giữ `_id` để đơn hàng cũ không đứt tham chiếu.
   */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProductImageDto {
  @IsString()
  @MaxLength(500)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  key?: string;
}

export class AttributeDto {
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(40)
  name: string;

  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(200)
  value: string;
}

export class ShippingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Khối lượng phải lớn hơn 0.' })
  @Max(1_000_000)
  weightGram: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  lengthCm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  widthCm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  heightCm?: number;
}

export class CreateProductDto {
  @IsString()
  @Transform(trim)
  @MinLength(2, { message: 'Tên sản phẩm cần tối thiểu 2 ký tự.' })
  @MaxLength(150, { message: 'Tên sản phẩm tối đa 150 ký tự.' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Mô tả tối đa 5000 ký tự.' })
  description?: string;

  @IsMongoId({ message: 'Danh mục không hợp lệ.' })
  categoryId: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_OPTION_TIERS, {
    message: `Tối đa ${MAX_OPTION_TIERS} nhóm phân loại.`,
  })
  @ValidateNested({ each: true })
  @Type(() => OptionTierDto)
  optionTiers?: OptionTierDto[];

  @IsArray()
  @ArrayMinSize(1, { message: 'Sản phẩm cần ít nhất 1 phân loại/giá bán.' })
  @ArrayMaxSize(200, { message: 'Tối đa 200 phân loại.' })
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants: VariantDto[];

  /**
   * Không bắt buộc: sản phẩm có thể không có ảnh chung nếu MỖI phân loại đã
   * có ảnh riêng — `ProductsService` kiểm tra chéo với `variants[].image`
   * chứ không chặn cứng ở đây.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9, { message: 'Tối đa 9 ảnh.' })
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images?: ProductImageDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductImageDto)
  video?: ProductImageDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => AttributeDto)
  attributes?: AttributeDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingDto)
  shipping?: ShippingDto;

  /** Chỉ cho tạo ở trạng thái nháp hoặc đăng bán ngay. */
  @IsOptional()
  @IsIn(['draft', 'active'], { message: 'Trạng thái không hợp lệ.' })
  status?: 'draft' | 'active';
}
