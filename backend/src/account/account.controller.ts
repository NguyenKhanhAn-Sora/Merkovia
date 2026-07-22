import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AccountProfileService } from './account-profile.service';
import { FavoritesService } from './favorites.service';
import {
  ChangePhoneDto,
  SaveAddressDto,
  SendPhoneCodeDto,
  UpdateProfileDto,
} from './dto/account.dto';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';

class PageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  limit?: number;
}

class FavoriteCheckDto {
  /** Danh sách id ngăn cách bằng dấu phẩy. */
  @IsString()
  @MaxLength(2000)
  ids: string;
}

/** Tài khoản người mua: hồ sơ, sổ địa chỉ, danh sách yêu thích. */
@Controller('account')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(
    private readonly account: AccountProfileService,
    private readonly favorites: FavoritesService,
  ) {}

  /* -------------------------------- Hồ sơ -------------------------------- */

  @Get('me')
  me(@CurrentUser() user: UserDocument) {
    return this.account.getMe(user);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  updateMe(@CurrentUser() user: UserDocument, @Body() dto: UpdateProfileDto) {
    return this.account.updateProfile(user, dto);
  }

  /* --------------------------- Số điện thoại ----------------------------- */

  /** Giới hạn chặt hơn hồ sơ: mỗi lượt gửi là một tin nhắn tốn tiền thật. */
  @Post('phone/code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  sendPhoneCode(
    @CurrentUser() user: UserDocument,
    @Body() dto: SendPhoneCodeDto,
  ) {
    return this.account.sendPhoneCode(user, dto);
  }

  @Patch('phone')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  changePhone(@CurrentUser() user: UserDocument, @Body() dto: ChangePhoneDto) {
    return this.account.changePhone(user, dto);
  }

  /* ------------------------------ Sổ địa chỉ ----------------------------- */

  @Get('addresses')
  listAddresses(@CurrentUser() user: UserDocument) {
    return this.account.listAddresses(user);
  }

  @Post('addresses')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createAddress(
    @CurrentUser() user: UserDocument,
    @Body() dto: SaveAddressDto,
  ) {
    return this.account.createAddress(user, dto);
  }

  @Patch('addresses/:id')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  updateAddress(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: SaveAddressDto,
  ) {
    return this.account.updateAddress(user, id, dto);
  }

  @Post('addresses/:id/default')
  @HttpCode(HttpStatus.OK)
  setDefault(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.account.setDefaultAddress(user, id);
  }

  @Delete('addresses/:id')
  @HttpCode(HttpStatus.OK)
  removeAddress(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.account.removeAddress(user, id);
  }

  /* ------------------------------ Yêu thích ------------------------------ */

  @Get('favorites')
  listFavorites(@CurrentUser() user: UserDocument, @Query() query: PageDto) {
    return this.favorites.list(user, query.page, query.limit);
  }

  /** Lọc ra những sản phẩm đang được thích — để tô tim ở trang duyệt. */
  @Get('favorites/check')
  checkFavorites(
    @CurrentUser() user: UserDocument,
    @Query() query: FavoriteCheckDto,
  ) {
    return this.favorites.idsOf(user, query.ids.split(',').filter(Boolean));
  }

  @Post('favorites/:productId')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  toggleFavorite(
    @CurrentUser() user: UserDocument,
    @Param('productId') productId: string,
  ) {
    return this.favorites.toggle(user, productId);
  }
}
