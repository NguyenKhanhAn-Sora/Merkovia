import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { NotificationsService } from './notifications.service';
import {
  ListNotificationsDto,
  NotificationIdsDto,
} from './dto/notifications.dto';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { scopeFromRequest } from '../common/auth-scope';
import type { UserDocument } from '../users/schemas/user.schema';

/**
 * Thông báo của người đang đăng nhập.
 *
 * `audience` LẤY TỪ APP gửi request (buyer/seller), giống cách chọn cookie —
 * nên cùng một tài khoản vừa mua vừa bán vẫn thấy hai luồng thông báo tách biệt
 * ở hai app, không lẫn vào nhau.
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: UserDocument,
    @Query() query: ListNotificationsDto,
    @Req() req: Request,
  ) {
    return this.notifications.list(user, scopeFromRequest(req), query.page);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: UserDocument, @Req() req: Request) {
    return this.notifications.unreadCount(user, scopeFromRequest(req));
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  markRead(
    @CurrentUser() user: UserDocument,
    @Body() dto: NotificationIdsDto,
    @Req() req: Request,
  ) {
    return this.notifications.markRead(user, scopeFromRequest(req), dto);
  }

  @Post('delete')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  remove(
    @CurrentUser() user: UserDocument,
    @Body() dto: NotificationIdsDto,
    @Req() req: Request,
  ) {
    return this.notifications.remove(user, scopeFromRequest(req), dto);
  }
}
