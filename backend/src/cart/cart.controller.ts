import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CartService } from './cart.service';
import {
  AddToCartDto,
  MergeCartDto,
  RemoveFromCartDto,
  SetQuantityDto,
} from './dto/cart.dto';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';

/** Giỏ hàng của người mua đang đăng nhập (khách vãng lai dùng localStorage). */
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() user: UserDocument) {
    return this.cart.get(user);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  add(@CurrentUser() user: UserDocument, @Body() dto: AddToCartDto) {
    return this.cart.add(user, dto);
  }

  @Patch('item')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  setQuantity(@CurrentUser() user: UserDocument, @Body() dto: SetQuantityDto) {
    return this.cart.setQuantity(user, dto.productId, dto.variantId, dto.quantity);
  }

  @Delete('item')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  remove(@CurrentUser() user: UserDocument, @Body() dto: RemoveFromCartDto) {
    return this.cart.remove(user, dto.productId, dto.variantId);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  clear(@CurrentUser() user: UserDocument) {
    return this.cart.clear(user);
  }

  /** Gộp giỏ tạm của khách vào giỏ server ngay sau khi đăng nhập. */
  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  merge(@CurrentUser() user: UserDocument, @Body() dto: MergeCartDto) {
    return this.cart.merge(user, dto.items);
  }
}
