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
import { SupportChatService } from './support-chat.service';
import {
  AdminListSupportDto,
  ListSupportMessagesDto,
  SendSupportMessageDto,
} from './dto/support-chat.dto';
import type { SupportUserRole } from './schemas/support-chat.schema';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { scopeFromRequest } from '../common/auth-scope';
import { AdminAuthGuard, CurrentAdmin } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import type { UserDocument } from '../users/schemas/user.schema';

/**
 * Chat hỗ trợ (CSKH) giữa người dùng và đội ngũ Merkovia — khác `chat/`
 * (mua-bán giữa buyer và MỘT shop cụ thể). MỘT bộ route cho cả app người mua
 * lẫn người bán, vai lấy từ app gửi request — cùng quy ước với `ChatController`.
 */
@Controller('support-chat')
@UseGuards(JwtAuthGuard)
export class SupportChatController {
  constructor(private readonly support: SupportChatService) {}

  private role(req: Request): SupportUserRole {
    return scopeFromRequest(req) === 'seller' ? 'seller' : 'buyer';
  }

  @Post('open')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  open(@CurrentUser() user: UserDocument, @Req() req: Request) {
    return this.support.openMine(user, this.role(req));
  }

  @Get('unread-count')
  unread(@CurrentUser() user: UserDocument, @Req() req: Request) {
    return this.support.unreadForMine(user, this.role(req));
  }

  @Get('messages')
  messages(
    @CurrentUser() user: UserDocument,
    @Query() query: ListSupportMessagesDto,
    @Req() req: Request,
  ) {
    return this.support.myMessages(user, this.role(req), query.before);
  }

  @Post('messages')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  send(
    @CurrentUser() user: UserDocument,
    @Body() dto: SendSupportMessageDto,
    @Req() req: Request,
  ) {
    return this.support.sendAsUser(user, this.role(req), {
      text: dto.text,
      images: dto.images,
    });
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  markRead(@CurrentUser() user: UserDocument, @Req() req: Request) {
    return this.support.markReadAsUser(user, this.role(req));
  }
}

/** Hộp thư CSKH của Kênh Quản trị — một hộp thư chung, mọi admin cùng thấy. */
@Controller('admin/support-chat')
@UseGuards(AdminAuthGuard)
export class AdminSupportChatController {
  constructor(private readonly support: SupportChatService) {}

  @Get()
  list(@Query() query: AdminListSupportDto) {
    return this.support.adminList(query.status ?? 'open');
  }

  @Get(':id/messages')
  messages(@Param('id') id: string, @Query() query: ListSupportMessagesDto) {
    return this.support.adminMessages(id, query.before);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  send(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: SendSupportMessageDto,
  ) {
    return this.support.adminSend(admin, id, { text: dto.text, images: dto.images });
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@Param('id') id: string) {
    return this.support.adminMarkRead(id);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(@CurrentAdmin() admin: AdminPrincipal, @Param('id') id: string) {
    return this.support.adminSetStatus(admin, id, 'closed');
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  reopen(@CurrentAdmin() admin: AdminPrincipal, @Param('id') id: string) {
    return this.support.adminSetStatus(admin, id, 'open');
  }
}
