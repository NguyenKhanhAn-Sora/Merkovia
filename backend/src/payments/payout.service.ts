import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payout, PayoutDocument } from './schemas/payout.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { PayoutProvider } from './gateway/payout.provider';
import { config } from '../config/config';
import { shortId } from '../common/text';
import type { UserDocument } from '../users/schemas/user.schema';

/** Số tiền tối thiểu mới cho rút — tránh phí chuyển khoản lớn hơn cả tiền rút. */
const MIN_PAYOUT_AMOUNT = 50_000;

@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(
    @InjectModel(Payout.name)
    private readonly payoutModel: Model<PayoutDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    private readonly provider: PayoutProvider,
  ) {}

  private newCode(): string {
    return `PO${Date.now().toString(36)}${shortId()}`.toUpperCase();
  }

  private async requireShop(user: UserDocument): Promise<ShopDocument> {
    const shop = await this.shopModel.findOne({ owner: user._id });
    if (!shop) throw new ForbiddenException('Tài khoản chưa có gian hàng.');
    return shop;
  }

  /** Mốc thời gian mà đơn giao trước đó đã hết hạn giữ tiền. */
  private holdCutoff(now = new Date()): Date {
    return new Date(now.getTime() - config.payoutHoldDays * 86_400_000);
  }

  /**
   * Người bán nhận TIỀN HÀNG, không nhận phí vận chuyển — phí đó là của đơn vị
   * giao hàng, sàn chỉ thu hộ. Hoa hồng tính trên tiền hàng.
   */
  private amountsOf(orders: OrderDocument[]) {
    const gross = orders.reduce((sum, o) => sum + o.itemsTotal, 0);
    const commission = Math.round(gross * config.commissionRate);
    return { gross, commission, net: gross - commission };
  }

  /* ------------------------------- Số dư -------------------------------- */

  /**
   * Số dư của gian hàng, chia làm ba phần để người bán hiểu tiền đang ở đâu:
   *  - `available`: đã giao xong và qua thời gian giữ → rút được ngay.
   *  - `holding`: đã giao nhưng còn trong cửa sổ khiếu nại của người mua.
   *  - `pending`: đơn đang chạy, chưa giao xong.
   */
  async balance(user: UserDocument) {
    const shop = await this.requireShop(user);
    const cutoff = this.holdCutoff();

    const [available, holding, running, paidOut] = await Promise.all([
      this.sumOrders({
        shop: shop._id,
        status: 'delivered',
        payout: null,
        deliveredAt: { $lte: cutoff },
      }),
      this.sumOrders({
        shop: shop._id,
        status: 'delivered',
        payout: null,
        deliveredAt: { $gt: cutoff },
      }),
      this.sumOrders({
        shop: shop._id,
        status: { $in: ['pending', 'confirmed', 'shipping'] },
      }),
      this.payoutModel.aggregate<{ total: number }>([
        { $match: { shop: shop._id, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$netAmount' } } },
      ]),
    ]);

    return {
      available,
      holding,
      running,
      totalPaidOut: paidOut[0]?.total ?? 0,
      commissionRate: config.commissionRate,
      holdDays: config.payoutHoldDays,
      minPayout: MIN_PAYOUT_AMOUNT,
      canRequest:
        available.net >= MIN_PAYOUT_AMOUNT && !!shop.bankAccount,
      hasBankAccount: !!shop.bankAccount,
      provider: { name: this.provider.name, isReal: this.provider.isReal },
    };
  }

  private async sumOrders(match: Record<string, unknown>) {
    const rows = await this.orderModel.aggregate<{
      gross: number;
      count: number;
    }>([
      { $match: match },
      { $group: { _id: null, gross: { $sum: '$itemsTotal' }, count: { $sum: 1 } } },
    ]);
    const gross = rows[0]?.gross ?? 0;
    const commission = Math.round(gross * config.commissionRate);
    return { gross, commission, net: gross - commission, count: rows[0]?.count ?? 0 };
  }

  /* ----------------------------- Tạo đợt chi ---------------------------- */

  /**
   * Gom các đơn đủ điều kiện thành một đợt chi trả rồi gửi lệnh chuyển tiền.
   *
   * 🔴 Giành đơn bằng `updateMany` có điều kiện `payout: null`. Đây là thứ duy
   * nhất ngăn một đơn bị trả tiền hai lần khi người bán bấm rút hai lần cùng
   * lúc hoặc job tự động chạy trùng nhịp: ai ghi được `payout` trước thì đơn đó
   * là của người ấy, người sau không thấy đơn nào nữa.
   */
  async requestPayout(user: UserDocument) {
    const shop = await this.requireShop(user);

    if (!shop.bankAccount) {
      throw new BadRequestException(
        'Vui lòng liên kết tài khoản ngân hàng trước khi rút tiền.',
      );
    }

    const payoutId = new Types.ObjectId();
    const claim = await this.orderModel.updateMany(
      {
        shop: shop._id,
        status: 'delivered',
        payout: null,
        deliveredAt: { $lte: this.holdCutoff() },
      },
      { $set: { payout: payoutId } },
    );

    if (claim.modifiedCount === 0) {
      throw new BadRequestException(
        'Chưa có đơn nào đủ điều kiện rút tiền. Đơn cần được giao thành công và qua thời gian giữ tiền.',
      );
    }

    const orders = await this.orderModel.find({ payout: payoutId });
    const { gross, commission, net } = this.amountsOf(orders);

    // Đền bù nếu không đủ điều kiện hoặc ghi hỏng: trả đơn về trạng thái chưa
    // gom, nếu không chúng sẽ mắc kẹt vĩnh viễn và người bán không rút được.
    const release = () =>
      this.orderModel
        .updateMany({ payout: payoutId }, { $set: { payout: null } })
        .catch((e: unknown) =>
          this.logger.error(`Không nhả được đơn khỏi payout: ${String(e)}`),
        );

    if (net < MIN_PAYOUT_AMOUNT) {
      await release();
      throw new BadRequestException(
        `Số tiền rút tối thiểu là ${MIN_PAYOUT_AMOUNT.toLocaleString('vi-VN')}đ.`,
      );
    }

    let payout: PayoutDocument;
    try {
      payout = await new this.payoutModel({
        _id: payoutId,
        code: this.newCode(),
        shop: shop._id,
        orders: orders.map((o) => o._id),
        grossAmount: gross,
        commissionAmount: commission,
        commissionRate: config.commissionRate,
        netAmount: net,
        status: 'pending',
        // Chụp lại: người bán đổi tài khoản sau này thì đợt chi cũ vẫn phải
        // hiện đúng nơi tiền đã thực sự đi tới.
        bankAccount: {
          bankBin: shop.bankAccount.bankBin,
          bankName: shop.bankAccount.bankName,
          accountNumber: shop.bankAccount.accountNumber,
          accountHolderName: shop.bankAccount.accountHolderName,
        },
        provider: this.provider.isReal ? this.provider.name : 'mock',
      }).save();
    } catch (e: unknown) {
      await release();
      throw e;
    }

    await this.sendTransfer(payout);
    return { payout: this.publicPayout(await this.payoutModel.findById(payoutId) as PayoutDocument) };
  }

  /**
   * Gửi lệnh chuyển tiền.
   *
   * Chuyển sang `processing` TRƯỚC khi gọi ra ngoài: nếu tiến trình chết giữa
   * chừng, đợt chi nằm ở trạng thái "đang xử lý" để đối soát, chứ không phải
   * "chờ" khiến ai đó gửi lệnh lần thứ hai.
   */
  private async sendTransfer(payout: PayoutDocument) {
    await this.payoutModel.updateOne(
      { _id: payout._id, status: 'pending' },
      { $set: { status: 'processing' } },
    );

    try {
      const result = await this.provider.transfer({
        code: payout.code,
        amount: payout.netAmount,
        bankBin: payout.bankAccount.bankBin,
        accountNumber: payout.bankAccount.accountNumber,
        accountHolderName: payout.bankAccount.accountHolderName,
        description: `Merkovia thanh toan ${payout.code}`,
      });

      await this.payoutModel.updateOne(
        { _id: payout._id },
        {
          $set: {
            providerRef: result.providerRef,
            status: result.status,
            failureReason: result.failureReason,
            ...(result.status === 'paid' ? { paidAt: new Date() } : {}),
          },
        },
      );

      if (result.status === 'failed') {
        // Nhả đơn ra để lần rút sau gom lại được — nếu giữ, tiền của người bán
        // bị kẹt vĩnh viễn vì đơn đã gắn vào một đợt chi thất bại.
        await this.orderModel.updateMany(
          { payout: payout._id },
          { $set: { payout: null } },
        );
        this.logger.error(
          `Chi trả ${payout.code} thất bại: ${result.failureReason ?? 'không rõ'}`,
        );
      }
    } catch (e: unknown) {
      // Không rõ lệnh đã đi hay chưa → GIỮ nguyên `processing` và giữ đơn.
      // Nhả đơn lúc này có nguy cơ chuyển tiền hai lần cho cùng số đơn.
      this.logger.error(
        `Lỗi khi gửi lệnh chi trả ${payout.code}, cần đối soát thủ công: ${String(e)}`,
      );
      throw new BadRequestException(
        'Không gửi được lệnh chuyển tiền. Yêu cầu đang được xử lý, vui lòng kiểm tra lại sau.',
      );
    }
  }

  /* ------------------------------ Truy vấn ------------------------------ */

  async listMine(user: UserDocument, page = 1, limit = 20) {
    const shop = await this.requireShop(user);
    const [items, total] = await Promise.all([
      this.payoutModel
        .find({ shop: shop._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.payoutModel.countDocuments({ shop: shop._id }),
    ]);
    return { items: items.map((p) => this.publicPayout(p)), total, page, limit };
  }

  private publicPayout(p: PayoutDocument) {
    return {
      id: String(p._id),
      code: p.code,
      orderCount: p.orders.length,
      grossAmount: p.grossAmount,
      commissionAmount: p.commissionAmount,
      commissionRate: p.commissionRate,
      netAmount: p.netAmount,
      status: p.status,
      // Che bớt: màn hình lịch sử không cần lộ đủ số tài khoản.
      bankName: p.bankAccount.bankName,
      accountNumberMasked: maskTail(p.bankAccount.accountNumber),
      accountHolderName: p.bankAccount.accountHolderName,
      paidAt: p.paidAt,
      failureReason: p.failureReason,
      createdAt: (p as unknown as { createdAt: Date }).createdAt,
    };
  }
}

function maskTail(s: string): string {
  return s.length <= 4 ? s : `${'•'.repeat(s.length - 4)}${s.slice(-4)}`;
}
