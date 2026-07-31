import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_MESSAGE_IMAGES,
  MAX_MESSAGE_LENGTH,
} from '../schemas/message.schema';

/** Mở (hoặc lấy lại) hội thoại. Người mua gửi `shopId`, người bán gửi `buyerId`. */
export class OpenConversationDto {
  @IsOptional()
  @IsMongoId({ message: 'Gian hàng không hợp lệ.' })
  shopId?: string;

  @IsOptional()
  @IsMongoId({ message: 'Người mua không hợp lệ.' })
  buyerId?: string;
}

export class ListConversationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class ListMessagesDto {
  /** Con trỏ thời gian: chỉ lấy tin CŨ hơn mốc này (ISO). */
  @IsOptional()
  @IsString()
  before?: string;
}

/** Một ảnh đính kèm (đã upload qua /media/chat). */
export class ChatImageDto {
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'Ảnh không hợp lệ.' },
  )
  url: string;

  @IsOptional()
  @IsString()
  key?: string;
}

export class SendMessageDto {
  /**
   * Văn bản KHÔNG bắt buộc — tin có thể chỉ gồm ảnh. Service kiểm "phải có ít
   * nhất text hoặc ảnh" vì class-validator khó diễn tả điều kiện chéo gọn gàng.
   */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH, {
    message: `Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự.`,
  })
  text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_MESSAGE_IMAGES, {
    message: `Tối đa ${MAX_MESSAGE_IMAGES} ảnh mỗi tin.`,
  })
  @ValidateNested({ each: true })
  @Type(() => ChatImageDto)
  images?: ChatImageDto[];
}
