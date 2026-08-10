import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentService } from './payment.service';
import {
  MockGatewayController,
  PaymentController,
  PaymentWebhookController,
} from './payment.controller';
import { PayoutService } from './payout.service';
import { AdminPayoutController, PayoutController } from './payout.controller';
import {
  BankLookupProvider,
  MockBankLookupProvider,
} from './bank-lookup.provider';
import {
  MockPaymentGatewayProvider,
  PaymentGatewayProvider,
} from './gateway/payment-gateway.provider';
import { MockPayoutProvider, PayoutProvider } from './gateway/payout.provider';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { Payout, PayoutSchema } from './schemas/payout.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { ShopsModule } from '../shops/shops.module';
import { AuthModule } from '../auth/auth.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

/**
 * Thanh toán: tài khoản nhận tiền, thu tiền người mua, chi tiền người bán.
 *
 * Cả ba nhà cung cấp đều gắn qua DI, nên chuyển sang dịch vụ thật (bankHub /
 * payOS / VNPay…) chỉ là đổi lớp ở đây — service, DTO và giao diện giữ nguyên.
 *
 * Cố ý **KHÔNG import OrdersModule** dù có dùng Order model: OrdersModule đã
 * import module này để tạo phiên thanh toán lúc checkout, import ngược lại sẽ
 * thành phụ thuộc vòng. Đăng ký model trực tiếp là đủ và rõ ràng hơn.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Payout.name, schema: PayoutSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
    ShopsModule,
    AuthModule,
    AdminAuthModule, // AdminAuthGuard cho trang đối soát rút tiền
    NotificationsModule, // báo "đơn mới" cho người bán khi thanh toán online xong
    AuditLogModule, // ghi nhật ký khi admin chốt thủ công đợt chi bị kẹt
  ],
  controllers: [
    PaymentsController,
    PaymentController,
    PaymentWebhookController,
    MockGatewayController,
    PayoutController,
    AdminPayoutController,
  ],
  providers: [
    PaymentsService,
    PaymentService,
    PayoutService,
    { provide: BankLookupProvider, useClass: MockBankLookupProvider },
    { provide: PaymentGatewayProvider, useClass: MockPaymentGatewayProvider },
    { provide: PayoutProvider, useClass: MockPayoutProvider },
  ],
  exports: [PaymentsService, PaymentService, PayoutService],
})
export class PaymentsModule {}
