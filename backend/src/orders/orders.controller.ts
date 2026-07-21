import {
  Body,
  Controller,
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
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  CancelOrderDto,
  QueryOrdersDto,
  UpdateOrderStatusDto,
} from './dto/query-orders.dto';
import type { OrderStatus } from './schemas/order.schema';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';

/**
 * Đơn hàng phía NGƯỜI MUA — mọi route đều yêu cầu đăng nhập và chỉ chạm được
 * đơn của chính mình (service lọc theo `buyer`).
 */
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Dữ liệu dựng sẵn cho trang thanh toán (sổ địa chỉ). */
  @Get('checkout-info')
  checkoutInfo(@CurrentUser() user: UserDocument) {
    return this.orders.checkoutInfo(user);
  }

  @Post()
  // Siết chặt hơn các route khác: đây là route ghi dữ liệu và trừ kho.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  checkout(@CurrentUser() user: UserDocument, @Body() dto: CreateOrderDto) {
    return this.orders.checkout(user, dto);
  }

  @Get()
  listMine(@CurrentUser() user: UserDocument, @Query() query: QueryOrdersDto) {
    return this.orders.listMine(user, query);
  }

  @Get(':id')
  getOne(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.orders.getMine(user, id);
  }

  /**
   * Bắt đầu / tiếp tục thanh toán — trả về link của cổng để người mua bấm vào.
   * Việc chốt "đã trả tiền" do webhook của cổng quyết định, không phải route này.
   */
  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  pay(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.orders.startPayment(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  cancel(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.cancelByBuyer(user, id, dto.reason);
  }
}

/**
 * Đơn hàng phía NGƯỜI BÁN. Tách controller riêng để đường dẫn nói rõ vai trò
 * và không có route nào vô tình dùng nhầm bộ lọc của phía kia.
 */
@Controller('shop-orders')
@UseGuards(JwtAuthGuard)
export class ShopOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@CurrentUser() user: UserDocument, @Query() query: QueryOrdersDto) {
    return this.orders.listForShop(user, query);
  }

  @Get(':id')
  getOne(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.orders.getForShop(user, id);
  }

  /** Đẩy đơn sang giai đoạn kế tiếp (xác nhận → giao → đã giao). */
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  updateStatus(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(user, id, dto.status as OrderStatus);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  cancel(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.cancelBySeller(user, id, dto.reason);
  }
}
