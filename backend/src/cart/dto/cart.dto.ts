import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsMongoId,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AddToCartDto {
  @IsMongoId({ message: 'Sản phẩm không hợp lệ.' })
  productId: string;

  @IsMongoId({ message: 'Phân loại không hợp lệ.' })
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number;
}

export class SetQuantityDto {
  @IsMongoId()
  productId: string;

  @IsMongoId()
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  quantity: number;
}

export class RemoveFromCartDto {
  @IsMongoId()
  productId: string;

  @IsMongoId()
  variantId: string;
}

/** Gộp giỏ khách vãng lai khi đăng nhập. */
export class MergeCartDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AddToCartDto)
  items: AddToCartDto[];
}
