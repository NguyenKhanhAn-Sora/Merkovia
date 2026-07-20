import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { MAX_OPTION_TIERS, PRODUCT_STATUS } from '../schemas/product.schema';
import {
  AttributeDto,
  OptionTierDto,
  ProductImageDto,
  ShippingDto,
  VariantDto,
} from './create-product.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Cập nhật sản phẩm — mọi trường tùy chọn, chỉ gửi cái cần đổi.
 * Ràng buộc giữ y hệt lúc tạo để không có đường vòng lách validate.
 */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(2, { message: 'Tên sản phẩm cần tối thiểu 2 ký tự.' })
  @MaxLength(150, { message: 'Tên sản phẩm tối đa 150 ký tự.' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'Mô tả tối đa 5000 ký tự.' })
  description?: string;

  @IsOptional()
  @IsMongoId({ message: 'Danh mục không hợp lệ.' })
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_OPTION_TIERS, {
    message: `Tối đa ${MAX_OPTION_TIERS} nhóm phân loại.`,
  })
  @ValidateNested({ each: true })
  @Type(() => OptionTierDto)
  optionTiers?: OptionTierDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Sản phẩm cần ít nhất 1 phân loại/giá bán.' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants?: VariantDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Cần ít nhất 1 ảnh sản phẩm.' })
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

  @IsOptional()
  @IsIn(PRODUCT_STATUS as unknown as string[], {
    message: 'Trạng thái không hợp lệ.',
  })
  status?: string;
}
