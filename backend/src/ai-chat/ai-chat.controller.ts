import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AiChatService } from './ai-chat.service';
import { SendAiMessageDto } from './dto/send-ai-message.dto';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { scopeFromRequest } from '../common/auth-scope';
import type { UserDocument } from '../users/schemas/user.schema';

/**
 * Trợ lý AI — `scope` lấy từ app gửi request (giống `NotificationsController`),
 * KHÔNG tin client tự khai, để một tài khoản vừa mua vừa bán không lẫn ngữ
 * cảnh buyer/seller giữa hai app.
 */
@Controller('ai-chat')
@UseGuards(JwtAuthGuard)
export class AiChatController {
  constructor(private readonly aiChat: AiChatService) {}

  @Get('history')
  history(@CurrentUser() user: UserDocument, @Req() req: Request) {
    return this.aiChat.getHistory(user, scopeFromRequest(req));
  }

  @Post('message')
  @HttpCode(HttpStatus.OK)
  // Mỗi tin tốn một lượt gọi Gemini — giới hạn chặt hơn mặc định để không
  // dội quota free tier, dù đã có UserThrottlerGuard toàn cục (120/phút).
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  send(
    @CurrentUser() user: UserDocument,
    @Body() dto: SendAiMessageDto,
    @Req() req: Request,
  ) {
    return this.aiChat.sendMessage(user, scopeFromRequest(req), dto.text);
  }

  @Post('history/clear')
  @HttpCode(HttpStatus.OK)
  clear(@CurrentUser() user: UserDocument, @Req() req: Request) {
    return this.aiChat.clearHistory(user, scopeFromRequest(req));
  }
}
