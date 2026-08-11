import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  /** Bỏ trống = tạo Ngành hàng gốc. Có giá trị = tạo Danh mục con dưới ngành hàng đó. */
  @IsOptional()
  @IsMongoId()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string;
}

export class ReorderCategoriesDto {
  /** Bỏ trống = sắp xếp lại nhóm Ngành hàng gốc. Có giá trị = sắp xếp lại các Danh mục con của ngành hàng đó. */
  @IsOptional()
  @IsMongoId()
  parentId?: string;

  /** Toàn bộ id anh em CÙNG NHÓM, theo đúng thứ tự mới. */
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  orderedIds: string[];
}

export class SetCategoryVisibilityDto {
  @IsBoolean()
  isActive: boolean;
}
