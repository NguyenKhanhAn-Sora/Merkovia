import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ChatService } from './chat.service';
import {
  ListConversationsDto,
  ListMessagesDto,
  OpenConversationDto,
  SendMessageDto,
} from './dto/chat.dto';
import type { ChatRole } from './schemas/conversation.schema';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { scopeFromRequest } from '../common/auth-scope';
import type { UserDocument } from '../users/schemas/user.schema';

/**
 * Tin nhắn giữa người mua và gian hàng.
 *
 * MỘT bộ route cho cả hai app: VAI lấy từ app gửi request (`x-merkovia-app`),
 * giống cách chọn cookie phiên và thông báo. Nhờ vậy không có hai bản logic dễ
 * trôi lệch, và người vừa mua vừa bán vẫn tách bạch hai vai.
 */
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  private role(req: Request): ChatRole {
    return scopeFromRequest(req) === 'seller' ? 'seller' : 'buyer';
  }

  /** Mở hội thoại với một gian hàng (người mua) hoặc một khách (người bán). */
  @Post('conversations')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  open(
    @CurrentUser() user: UserDocument,
    @Body() dto: OpenConversationDto,
    @Req() req: Request,
  ) {
    return this.chat.open(user, this.role(req), dto);
  }

  @Get('conversations')
  list(
    @CurrentUser() user: UserDocument,
    @Query() query: ListConversationsDto,
    @Req() req: Request,
  ) {
    return this.chat.list(user, this.role(req), query.page);
  }

  /** Tổng tin chưa đọc — cho badge. Đặt TRƯỚC route có `:id` kẻo bị nuốt. */
  @Get('unread-count')
  unread(@CurrentUser() user: UserDocument, @Req() req: Request) {
    return this.chat.unreadTotal(user, this.role(req));
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Query() query: ListMessagesDto,
    @Req() req: Request,
  ) {
    return this.chat.messages(user, this.role(req), id, query.before);
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.OK)
  // Rộng tay hơn các route khác: gõ chat nhanh là chuyện bình thường.
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  send(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @Req() req: Request,
  ) {
    return this.chat.send(user, this.role(req), id, dto.text);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  markRead(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.chat.markRead(user, this.role(req), id);
  }
}
