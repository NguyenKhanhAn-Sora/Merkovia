import { Type } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MAX_MESSAGE_LENGTH } from '../schemas/message.schema';

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

export class SendMessageDto {
  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập nội dung tin nhắn.' })
  @MaxLength(MAX_MESSAGE_LENGTH, {
    message: `Tin nhắn tối đa ${MAX_MESSAGE_LENGTH} ký tự.`,
  })
  text: string;
}
