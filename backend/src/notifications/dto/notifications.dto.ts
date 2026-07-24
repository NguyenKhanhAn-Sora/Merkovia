import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ListNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

/**
 * Chọn thông báo để đánh dấu đọc / xoá.
 * `all=true` áp cho tất cả; ngược lại chỉ `ids`. Gửi cả hai thì `all` thắng.
 */
export class NotificationIdsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @IsBoolean()
  all?: boolean;
}
