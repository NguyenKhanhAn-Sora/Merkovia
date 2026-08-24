import { IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_AI_CHAT_MESSAGE_LENGTH } from '../schemas/ai-chat-message.schema';

export class SendAiMessageDto {
  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập nội dung.' })
  @MaxLength(MAX_AI_CHAT_MESSAGE_LENGTH, { message: 'Nội dung quá dài.' })
  text: string;
}
