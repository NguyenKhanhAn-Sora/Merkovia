import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FollowsService } from './follows.service';
import { QueryFollowsDto } from './dto/query-follows.dto';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';

/** Người mua theo dõi gian hàng — trang "Đang theo dõi" + nút theo dõi ở trang shop/sản phẩm. */
@Controller('account/follows')
@UseGuards(JwtAuthGuard)
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Get()
  list(@CurrentUser() user: UserDocument, @Query() query: QueryFollowsDto) {
    return this.follows.list(user, query.page, query.limit, query.q);
  }

  @Get(':shopId/check')
  check(@CurrentUser() user: UserDocument, @Param('shopId') shopId: string) {
    return this.follows.isFollowing(user, shopId);
  }

  @Post(':shopId')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  toggle(@CurrentUser() user: UserDocument, @Param('shopId') shopId: string) {
    return this.follows.toggle(user, shopId);
  }
}
