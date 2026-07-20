import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** Đổi logo gian hàng: ảnh đã crop (hiển thị) + ảnh gốc & thông số crop để sửa lại sau. */
export class UpdateShopLogoDto {
  @IsString()
  @MaxLength(500)
  logoUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoOriginalUrl?: string;

  @IsOptional()
  @IsObject()
  logoCrop?: Record<string, unknown>;
}
