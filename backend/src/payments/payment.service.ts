import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import {
  GatewayWebhookEvent,
  PaymentGatewayProvider,
} from './gateway/payment-gateway.provider';
import { config } from '../config/config';
import { shortId } from '../common/text';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import type { UserDocument } from '../users/schemas/user.schema';

/**
 * Khoảng ân hạn sau khi hết hạn thanh toán, TRƯỚC khi job dám huỷ đơn.
 *
 * Người mua bấm trả tiền ở giây cuối thì webhook còn đang trên đường. Huỷ ngay
 * lúc đó là vừa thu tiền vừa huỷ đơn — tình huống tệ nhất của cả hệ thống.
 */
export const PAYMENT_GRACE_MINUTES = 2;

/** Phiên treo quá lâu thì chủ động hỏi ngược cổng (phòng webhook thất lạc). */
const RECONCILE_AFTER_MINUTES = 3;

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly gateway: PaymentGatewayProvider,
    private readonly notifications: NotificationsService,
    private readonly settings: PlatformSettingsService,
  ) {}

  private newCode(): string {
    return `PM${Date.now().toString(36)}${shortId()}`.toUpperCase();
  }

  get providerInfo() {
    return { name: this.gateway.name, isReal: this.gateway.isReal };
  }

  /* ----------------------------- Tạo phiên ------------------------------ */

  /**
   * Tạo phiên thanh toán cho MỘT lần bấm đặt hàng (nhiều đơn nếu nhiều shop).
   *
   * Lỗi ở đây KHÔNG được làm hỏng việc tạo đơn — đơn đã ghi và kho đã giữ rồi.
   * Không tạo được link thì đơn vẫn nằm chờ thanh toán, người mua bấm "Thanh
   * toán ngay" ở trang chi tiết để thử lại.
   */
  async createForCheckout(input: {
    buyer: Types.ObjectId;
    checkoutGroup: Types.ObjectId;
    orderIds: Types.ObjectId[];
    amount: number;
    expiresAt: Date;
  }): Promise<PaymentDocument | null> {
    try {
      return await this.createPayment(input);
    } catch (e: unknown) {
      this.logger.error(`Không tạo được phiên thanh toán: ${String(e)}`);
      return null;
    }
  }

  private async createPayment(input: {
    buyer: Types.ObjectId;
    checkoutGroup: Types.ObjectId;
    orderIds: Types.ObjectId[];
    amount: number;
    expiresAt: Date;
  }): Promise<PaymentDocument> {
    const code = this.newCode();
    const created = await this.gateway.createPayment({
      code,
      amount: input.amount,
      description: `Thanh toan don hang Merkovia ${code}`,
      expiresAt: input.expiresAt,
      returnUrl: `${config.frontendUrl}/orders?paid=1`,
      cancelUrl: `${config.frontendUrl}/orders`,
    });

    const payment = await new this.paymentModel({
      code,
      buyer: input.buyer,
      checkoutGroup: input.checkoutGroup,
      orders: input.orderIds,
      amount: input.amount,
      status: 'pending',
      provider: this.gateway.isReal ? this.gateway.name : 'mock',
      providerRef: created.providerRef,
      checkoutUrl: created.checkoutUrl,
      expiresAt: input.expiresAt,
      events: [{ at: new Date(), type: 'created' }],
    }).save();

    // Gắn ngược vào đơn để tra cứu hai chiều khi đối soát.
    await this.orderModel.updateMany(
      { _id: { $in: input.orderIds } },
      { $set: { payment: payment._id } },
    );

    return payment;
  }

  /**
   * Bắt đầu hoặc tiếp tục thanh toán cho đơn — thay cho `markPaid` cũ.
   *
   * Trả lại link của phiên đang chờ nếu còn hiệu lực (bấm hai lần không tạo
   * hai phiên), tạo phiên mới nếu lần trước thất bại và đơn vẫn còn hạn.
   */
  async startPayment(user: UserDocument, orderId: string) {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }
    const order = await this.orderModel.findOne({
      _id: orderId,
      buyer: user._id,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');

    if (order.status !== 'pending_payment') {
      throw new BadRequestException(
        order.status === 'cancelled'
          ? 'Đơn hàng đã bị huỷ do quá hạn thanh toán.'
          : 'Đơn hàng này không ở trạng thái chờ thanh toán.',
      );
    }
    if (
      order.paymentExpiresAt &&
      order.paymentExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'Đã quá hạn thanh toán cho đơn này. Vui lòng đặt lại.',
      );
    }

    const existing = await this.paymentModel.findOne({
      checkoutGroup: order.checkoutGroup,
      status: 'pending',
    });
    if (existing?.checkoutUrl) {
      return this.publicPayment(existing);
    }

    // Chỉ tính tiền các đơn CÒN chờ thanh toán: vài đơn trong nhóm có thể đã
    // bị người mua huỷ lẻ, thu theo tổng cũ là thu thừa.
    const payable = await this.orderModel.find({
      checkoutGroup: order.checkoutGroup,
      buyer: user._id,
      status: 'pending_payment',
    });
    if (payable.length === 0) {
      throw new BadRequestException('Không còn đơn nào cần thanh toán.');
    }

    const payment = await this.createPayment({
      buyer: user._id,
      checkoutGroup: order.checkoutGroup!,
      orderIds: payable.map((o) => o._id),
      amount: payable.reduce((sum, o) => sum + o.total, 0),
      expiresAt: order.paymentExpiresAt ?? new Date(Date.now() + 15 * 60_000),
    });
    return this.publicPayment(payment);
  }

  /* ------------------------------ Webhook ------------------------------- */

  /**
   * Xử lý webhook từ cổng thanh toán.
   *
   * Đây là ranh giới bảo mật của toàn bộ luồng tiền, nên thứ tự kiểm tra là
   * bắt buộc và không được đảo:
   *  1. **Chữ ký** — sai thì dừng ngay, không đọc tới nội dung.
   *  2. **Đã xử lý chưa** — cổng nào cũng gửi lại khi chưa nhận được 200.
   *  3. **Số tiền** — trả thiếu là gian lận kinh điển; KHÔNG giao hàng.
   *  4. **Giành chuyển trạng thái** bằng updateOne có điều kiện.
   *
   * Trả 200 cho mọi trường hợp đã xử lý xong (kể cả phiên lạ) để cổng ngừng
   * bắn lại; chỉ chữ ký sai mới ném lỗi.
   */
  async handleWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const verified = this.gateway.verifyWebhook(rawBody, headers);
    if (!verified.valid || !verified.event) {
      this.logger.warn(`Webhook bị từ chối: ${verified.reason ?? 'không rõ'}`);
      throw new UnauthorizedException(
        verified.reason ?? 'Webhook không hợp lệ.',
      );
    }

    const event = verified.event;
    const payment = await this.paymentModel.findOne({ code: event.code });
    if (!payment) {
      // Không phải lỗi của cổng — có thể là phiên của môi trường khác.
      this.logger.warn(`Webhook cho phiên không tồn tại: ${event.code}`);
      return { ok: true, ignored: 'unknown_payment' };
    }

    if (payment.handledEventIds.includes(event.eventId)) {
      return { ok: true, ignored: 'duplicate_event' };
    }

    if (payment.status !== 'pending') {
      await this.logEvent(payment, 'late_event', event, 'Phiên đã kết thúc.');
      return { ok: true, ignored: 'already_settled' };
    }

    if (event.status === 'paid') return this.applyPaid(payment, event);
    if (event.status === 'failed' || event.status === 'expired') {
      return this.applyFailed(payment, event);
    }
    return { ok: true, ignored: 'no_op' };
  }

  /** Ghi nhật ký sự kiện mà không đổi trạng thái. */
  private async logEvent(
    payment: PaymentDocument,
    type: string,
    event: GatewayWebhookEvent,
    note?: string,
  ) {
    await this.paymentModel.updateOne(
      { _id: payment._id },
      {
        $push: {
          events: {
            at: new Date(),
            type,
            payload: event as unknown as Record<string, unknown>,
            note,
          },
        },
        $addToSet: { handledEventIds: event.eventId },
      },
    );
  }

  private async applyPaid(
    payment: PaymentDocument,
    event: GatewayWebhookEvent,
  ) {
    // Trả THIẾU: không giao hàng, giữ tiền lại và đánh dấu cần hoàn.
    if (event.amount < payment.amount) {
      await this.paymentModel.updateOne(
        { _id: payment._id, status: 'pending' },
        {
          $set: {
            status: 'paid',
            paidAmount: event.amount,
            paidAt: new Date(),
            needsRefund: true,
            refundReason: `Thu thiếu: nhận ${event.amount}đ, cần ${payment.amount}đ.`,
          },
          $addToSet: { handledEventIds: event.eventId },
          $push: {
            events: {
              at: new Date(),
              type: 'amount_mismatch',
              payload: event as unknown as Record<string, unknown>,
            },
          },
        },
      );
      this.logger.error(
        `Phiên ${payment.code} thu thiếu: ${event.amount}/${payment.amount}. Đơn KHÔNG được xác nhận.`,
      );
      return { ok: true, warning: 'amount_mismatch' };
    }

    // Giành quyền chốt phiên — hai webhook song song thì chỉ một cái đi tiếp.
    const claimed = await this.paymentModel.updateOne(
      { _id: payment._id, status: 'pending' },
      {
        $set: {
          status: 'paid',
          paidAmount: event.amount,
          paidAt: new Date(),
          providerRef: event.providerRef ?? payment.providerRef,
        },
        $addToSet: { handledEventIds: event.eventId },
        $push: {
          events: {
            at: new Date(),
            type: 'paid',
            payload: event as unknown as Record<string, unknown>,
          },
        },
      },
    );
    if (claimed.modifiedCount !== 1) {
      return { ok: true, ignored: 'race_lost' };
    }

    // Chỉ đơn CÒN chờ thanh toán mới được chuyển tiếp.
    // Đơn vừa vào `pending` bắt đầu tính SLA xác nhận của người bán — không
    // tính từ lúc đặt (còn ở `pending_payment` chờ tiền không phải lỗi của
    // người bán) mà từ lúc thật sự vào hàng đợi xử lý, đối xứng với đơn COD
    // (xem `buildGroups`, hạn chốt ngay lúc đặt vì COD vào thẳng `pending`).
    const paidNow = new Date();
    const s = this.settings.get();
    const applied = await this.orderModel.updateMany(
      { _id: { $in: payment.orders }, status: 'pending_payment' },
      {
        $set: {
          status: 'pending',
          paidAt: paidNow,
          sellerActionDeadlineAt: new Date(
            paidNow.getTime() + s.orderConfirmHours * 3_600_000,
          ),
          sellerActionWarnAt: new Date(
            paidNow.getTime() + s.orderConfirmWarnHours * 3_600_000,
          ),
        },
        $unset: { paymentExpiresAt: '' },
        $push: {
          timeline: {
            status: 'pending',
            at: new Date(),
            by: 'system',
            note: 'Đã thanh toán',
          },
        },
      },
    );

    // 🔴 Tiền đã thu nhưng có đơn không nhận được (đã huỷ vì quá hạn, hoặc
    // người mua tự huỷ). Không thể hồi sinh đơn vì kho có thể đã bán cho người
    // khác → phải hoàn tiền, và phải nói to chứ không nuốt lỗi.
    if (applied.modifiedCount !== payment.orders.length) {
      await this.paymentModel.updateOne(
        { _id: payment._id },
        {
          $set: {
            needsRefund: true,
            refundReason: `Đã thu tiền nhưng chỉ ${applied.modifiedCount}/${payment.orders.length} đơn còn hiệu lực.`,
          },
        },
      );
      this.logger.error(
        `CẦN HOÀN TIỀN — phiên ${payment.code}: thu ${event.amount}đ nhưng chỉ ${applied.modifiedCount}/${payment.orders.length} đơn còn nhận được.`,
      );
      // Vẫn báo "đơn mới" cho các đơn ĐÃ chuyển tiếp thành công.
      await this.notifyNewOrders(payment.orders);
      return { ok: true, warning: 'partial_orders' };
    }

    // Đơn online chỉ "đến tay người bán" khi tiền đã về — báo đơn mới lúc này,
    // không phải lúc tạo đơn (đơn chưa trả có thể bị bỏ, báo sớm là báo hụt).
    await this.notifyNewOrders(payment.orders);
    return { ok: true };
  }

  /** Báo "đơn mới" cho người bán của các đơn vừa chuyển sang `pending`. */
  private async notifyNewOrders(orderIds: Types.ObjectId[]): Promise<void> {
    try {
      const orders = await this.orderModel
        .find({ _id: { $in: orderIds }, status: 'pending' })
        .select('shop orderCode items');
      for (const o of orders) {
        const first = o.items[0]?.name ?? 'sản phẩm';
        const more = o.items.length - 1;
        await this.notifications.notifyShop(o.shop, {
          type: 'new_order',
          title: 'Bạn có đơn hàng mới',
          body: `Đơn ${o.orderCode}: ${more > 0 ? `${first} và ${more} sản phẩm khác` : first}.`,
          link: `/orders/${String(o._id)}`,
          data: { orderId: String(o._id), orderCode: o.orderCode },
        });
      }
    } catch (err: unknown) {
      this.logger.warn(`Không báo được đơn mới (online): ${String(err)}`);
    }
  }

  private async applyFailed(
    payment: PaymentDocument,
    event: GatewayWebhookEvent,
  ) {
    await this.paymentModel.updateOne(
      { _id: payment._id, status: 'pending' },
      {
        $set: { status: event.status === 'expired' ? 'expired' : 'failed' },
        $addToSet: { handledEventIds: event.eventId },
        $push: {
          events: {
            at: new Date(),
            type: event.status,
            payload: event as unknown as Record<string, unknown>,
          },
        },
      },
    );
    // Cố ý KHÔNG huỷ đơn ở đây: người mua còn trong hạn thì được thử lại bằng
    // phiên mới. Hết hạn thì job dọn đơn sẽ lo, một đường duy nhất.
    return { ok: true };
  }

  /* ------------------------------ Đối soát ------------------------------ */

  /**
   * Hỏi ngược cổng về các phiên còn treo.
   *
   * Webhook CÓ THỂ mất — mạng chập chờn, server restart đúng lúc, cổng gặp sự
   * cố. Chỉ dựa vào webhook thì sớm muộn cũng có đơn khách đã trả tiền mà hệ
   * thống không biết. Đây là lưới an toàn bắt buộc, không phải tính năng thêm.
   */
  async reconcilePending(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RECONCILE_AFTER_MINUTES * 60_000);
    const stale = await this.paymentModel
      .find({ status: 'pending', createdAt: { $lte: cutoff } })
      .limit(100);

    let changed = 0;
    for (const payment of stale) {
      if (!payment.providerRef) continue;
      try {
        const status = await this.gateway.getStatus(payment.providerRef);
        if (status === 'pending') continue;

        // Đi qua đúng đường xử lý webhook để logic chỉ tồn tại ở MỘT chỗ.
        const event: GatewayWebhookEvent = {
          eventId: `reconcile-${payment.code}-${status}`,
          code: payment.code,
          status,
          amount: payment.amount,
          providerRef: payment.providerRef,
        };
        if (payment.handledEventIds.includes(event.eventId)) continue;

        if (status === 'paid') await this.applyPaid(payment, event);
        else await this.applyFailed(payment, event);
        changed++;
      } catch (e: unknown) {
        this.logger.warn(
          `Đối soát phiên ${payment.code} thất bại: ${String(e)}`,
        );
      }
    }

    if (changed) {
      this.logger.log(`Đối soát: cập nhật ${changed} phiên thanh toán.`);
    }
    return changed;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleReconcile() {
    await this.reconcilePending().catch((e: unknown) =>
      this.logger.error(`Lỗi đối soát thanh toán: ${String(e)}`),
    );
  }

  /* ----------------------------- Truy vấn ------------------------------- */

  async getByCode(code: string) {
    const payment = await this.paymentModel.findOne({ code });
    if (!payment)
      throw new NotFoundException('Không tìm thấy phiên thanh toán.');
    return payment;
  }

  /** Phiên của người mua — dùng cho trang thanh toán. */
  async getMine(user: UserDocument, code: string) {
    const payment = await this.paymentModel.findOne({
      code,
      buyer: user._id,
    });
    if (!payment)
      throw new NotFoundException('Không tìm thấy phiên thanh toán.');
    return { payment: this.publicPayment(payment) };
  }

  /**
   * Đánh dấu phiên thanh toán cần hoàn tiền cho một đơn đã huỷ.
   *
   * 🔴 Lỗ hổng này từng để tiền của khách biến mất khỏi mọi báo cáo: đơn trả
   * tiền online rồi bị huỷ (người bán hết hàng, giao thất bại…) thì kho được
   * hoàn, đơn chuyển sang `cancelled`, nhưng TIỀN vẫn nằm im ở sàn và không ai
   * biết là phải trả lại. Không tự hoàn được vì chưa có cổng thanh toán thật —
   * nhưng ít nhất phải ghi thành một khoản nợ nhìn thấy được.
   *
   * Một phiên có thể trả cho NHIỀU đơn (giỏ nhiều gian hàng), nên lý do phải
   * ghi rõ đơn nào và bao nhiêu tiền, cộng dồn qua từng lần huỷ.
   */
  async flagRefundForOrder(input: {
    paymentId: Types.ObjectId;
    orderCode: string;
    amount: number;
    reason: string;
  }): Promise<void> {
    const note = `Đơn ${input.orderCode} đã huỷ (${input.reason}) — cần hoàn ${input.amount.toLocaleString('vi-VN')}đ.`;
    try {
      const payment = await this.paymentModel.findById(input.paymentId);
      // Chưa thu được tiền thì không có gì để hoàn.
      if (!payment || payment.status !== 'paid') return;

      payment.needsRefund = true;
      payment.refundReason = payment.refundReason
        ? `${payment.refundReason} | ${note}`
        : note;
      await payment.save();

      // Ghi to vào log: đây là tiền thật của người khác đang nằm ở chỗ mình.
      this.logger.error(`CẦN HOÀN TIỀN — phiên ${payment.code}: ${note}`);
    } catch (err: unknown) {
      // Không được làm hỏng việc huỷ đơn: kho đã hoàn, đơn đã đóng.
      this.logger.error(
        `Không đánh dấu được hoàn tiền cho ${input.orderCode}: ${String(err)}`,
      );
    }
  }

  /** Các phiên cần hoàn tiền — dữ liệu cho trang quản trị sau này. */
  async listNeedingRefund() {
    const payments = await this.paymentModel
      .find({ needsRefund: true, refundedAt: null })
      .sort({ createdAt: -1 })
      .limit(100);
    return { items: payments.map((p) => this.publicPayment(p)) };
  }

  publicPayment(p: PaymentDocument) {
    return {
      code: p.code,
      amount: p.amount,
      paidAmount: p.paidAmount,
      status: p.status,
      checkoutUrl: p.checkoutUrl,
      expiresAt: p.expiresAt,
      paidAt: p.paidAt,
      needsRefund: p.needsRefund,
      orderCount: p.orders.length,
      provider: { name: this.gateway.name, isReal: this.gateway.isReal },
    };
  }
}
