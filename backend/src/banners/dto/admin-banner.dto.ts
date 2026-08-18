import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBannerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label: string;

  /** Ảnh ĐÃ CẮT theo đúng tỉ lệ 16:5 — cái buyer sẽ thấy. */
  @IsString()
  @MaxLength(500)
  imageUrl: string;

  @IsString()
  @MinLength(1)
  imageKey: string;

  /** Ảnh gốc chưa cắt — giữ để sửa crop lại sau không cần tải ảnh mới. */
  @IsString()
  @MaxLength(500)
  imageOriginalUrl: string;

  @IsString()
  @MinLength(1)
  imageOriginalKey: string;

  @IsOptional()
  @IsObject()
  crop?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  link?: string;
}

export class UpdateBannerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  link?: string;

  /**
   * Bộ ảnh thay thế — TUỲ CHỌN. Có `imageUrl` nghĩa là admin vừa cắt/tải ảnh
   * mới, đi kèm đủ cả 4 trường bên dưới; không gửi gì thì giữ nguyên ảnh cũ.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  imageKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageOriginalUrl?: string;

  @IsOptional()
  @IsString()
  imageOriginalKey?: string;

  @IsOptional()
  @IsObject()
  crop?: Record<string, unknown>;
}

export class ReorderBannersDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  orderedIds: string[];
}

export class SetBannerVisibilityDto {
  @IsBoolean()
  isActive: boolean;
}
