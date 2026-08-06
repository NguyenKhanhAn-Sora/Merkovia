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
import {
  CreateOrderDto,
  QuoteCartDto,
  UpdateShippingAddressDto,
} from './dto/create-order.dto';
import {
  CancelOrderDto,
  QueryOrdersDto,
  RespondCancelDto,
  UpdateOrderStatusDto,
} from './dto/query-orders.dto';
import { RequestReturnDto, RespondReturnDto } from './dto/return.dto';
import type { OrderStatus } from './schemas/order.schema';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard, CurrentAdmin } from '../admin-auth/admin-auth.guard';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
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

  /**
   * Báo giá giỏ hàng (tiền hàng + cước vận chuyển) trước khi đặt.
   * Chỉ đọc, không giữ kho — trang thanh toán gọi lại mỗi khi đổi địa chỉ.
   */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  quote(@CurrentUser() user: UserDocument, @Body() dto: QuoteCartDto) {
    return this.orders.quote(user, dto);
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
    return this.orders.cancelByBuyer(user, id, dto.reasonType, dto.reason);
  }

  /**
   * Sửa địa chỉ giao hàng. Phạm vi được sửa tuỳ trạng thái đơn — service
   * quyết định và trả về thông báo cụ thể khi từ chối.
   */
  @Patch(':id/shipping-address')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  updateAddress(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: UpdateShippingAddressDto,
  ) {
    return this.orders.updateShippingAddress(user, id, dto);
  }

  /** Người mua xác nhận đã nhận được hàng → mở khoá tiền cho người bán. */
  @Post(':id/received')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  confirmReceived(@CurrentUser() user: UserDocument, @Param('id') id: string) {
    return this.orders.confirmReceived(user, id);
  }

  /** Xin huỷ sau khi người bán đã xác nhận (cần người bán duyệt). */
  @Post(':id/cancel-request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  requestCancel(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.requestCancel(user, id, dto.reasonType, dto.reason);
  }

  /** Yêu cầu trả hàng sau khi đã nhận (cần người bán duyệt). */
  @Post(':id/return-request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  requestReturn(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: RequestReturnDto,
  ) {
    return this.orders.requestReturn(user, id, dto);
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

  /** Số liệu cho trang Tổng quan. Đặt TRƯỚC `:id` kẻo bị route đó nuốt. */
  @Get('stats')
  stats(@CurrentUser() user: UserDocument) {
    return this.orders.shopStats(user);
  }

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

  /** Giao hàng thất bại — hàng trả về, hoàn kho và đánh dấu hoàn tiền. */
  @Post(':id/delivery-failed')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  deliveryFailed(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.markDeliveryFailed(user, id, dto.reason);
  }

  /** Duyệt hoặc từ chối yêu cầu huỷ của người mua. */
  @Post(':id/cancel-request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  respondCancel(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: RespondCancelDto,
  ) {
    return this.orders.respondCancelRequest(user, id, dto.approve, dto.note);
  }

  /** Duyệt hoặc từ chối yêu cầu trả hàng của người mua. */
  @Post(':id/return-request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  respondReturn(
    @CurrentUser() user: UserDocument,
    @Param('id') id: string,
    @Body() dto: RespondReturnDto,
  ) {
    return this.orders.respondReturn(user, id, dto.approve, dto.note);
  }
}

/**
 * Tranh chấp huỷ/trả hàng của các gian hàng ĐANG BỊ ĐÌNH CHỈ — shop bị đình
 * chỉ không được tự duyệt (xung đột lợi ích, xem `OrdersService.respondCancelRequest`),
 * nên admin xử lý thay qua đây.
 */
@Controller('admin/orders')
@UseGuards(AdminAuthGuard)
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('disputes')
  disputes() {
    return this.orders.adminListDisputes();
  }

  @Post(':id/cancel-request')
  @HttpCode(HttpStatus.OK)
  respondCancel(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: RespondCancelDto,
  ) {
    return this.orders.adminRespondCancelRequest(
      admin,
      id,
      dto.approve,
      dto.note,
    );
  }

  @Post(':id/return-request')
  @HttpCode(HttpStatus.OK)
  respondReturn(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id') id: string,
    @Body() dto: RespondReturnDto,
  ) {
    return this.orders.adminRespondReturn(admin, id, dto.approve, dto.note);
  }
}
