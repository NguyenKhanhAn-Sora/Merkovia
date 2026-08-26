import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  SUPPORT_MAX_IMAGES,
  SUPPORT_MAX_MESSAGE_LENGTH,
} from '../schemas/support-chat.schema';

export class ListSupportMessagesDto {
  /** Con trỏ thời gian: chỉ lấy tin CŨ hơn mốc này (ISO). */
  @IsOptional()
  @IsString()
  before?: string;
}

export class SupportImageDto {
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'Ảnh không hợp lệ.' },
  )
  url: string;

  @IsOptional()
  @IsString()
  key?: string;
}

export class SendSupportMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(SUPPORT_MAX_MESSAGE_LENGTH, {
    message: `Tin nhắn tối đa ${SUPPORT_MAX_MESSAGE_LENGTH} ký tự.`,
  })
  text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(SUPPORT_MAX_IMAGES, {
    message: `Tối đa ${SUPPORT_MAX_IMAGES} ảnh mỗi tin.`,
  })
  @ValidateNested({ each: true })
  @Type(() => SupportImageDto)
  images?: SupportImageDto[];
}

/** Trang hộp thư CSKH của admin: lọc theo trạng thái xử lý. */
export class AdminListSupportDto {
  @IsOptional()
  @IsIn(['open', 'closed', 'all'], { message: 'Bộ lọc không hợp lệ.' })
  status?: 'open' | 'closed' | 'all';
}
