import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payout, PayoutDocument, PayoutStatus } from './schemas/payout.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { PayoutProvider } from './gateway/payout.provider';
import { shortId } from '../common/text';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import type { UserDocument } from '../users/schemas/user.schema';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';

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
    private readonly notifications: NotificationsService,
    private readonly auditLog: AuditLogService,
    private readonly settings: PlatformSettingsService,
  ) {}

  private newCode(): string {
    return `PO${Date.now().toString(36)}${shortId()}`.toUpperCase();
  }

  private async requireShop(user: UserDocument): Promise<ShopDocument> {
    const shop = await this.shopModel.findOne({ owner: user._id });
    if (!shop) throw new ForbiddenException('Tài khoản chưa có gian hàng.');
    return shop;
  }

  /**
   * Mốc thời gian mà đơn giao trước đó đã hết hạn giữ tiền.
   *
   * 🔴 Giữ tới hết CỬA SỔ TRẢ HÀNG chứ không chỉ `payoutHoldDays`: trả tiền cho
   * người bán trước khi người mua hết quyền trả hàng thì đến lúc duyệt trả
   * hàng, tiền đã sang tay và không đòi lại được. Lấy mốc xa hơn trong hai cái.
   */
  private holdCutoff(now = new Date()): Date {
    const s = this.settings.get();
    const holdDays = Math.max(s.payoutHoldDays, s.returnWindowDays);
    return new Date(now.getTime() - holdDays * 86_400_000);
  }

  /**
   * Điều kiện đơn đủ để chi trả cho người bán.
   *
   * Ngoài "đã giao, chưa gom, qua hạn giữ tiền" còn phải KHÔNG có yêu cầu trả
   * hàng đang chờ: người mua gửi yêu cầu ở ngày cuối cửa sổ, tới khi qua hạn mà
   * người bán chưa xử lý thì tiền vẫn phải bị giữ. Đơn đã trả hàng có
   * `status: 'returned'` nên đã tự rớt khỏi điều kiện `status: 'delivered'`.
   */
  private payableFilter(shopId: Types.ObjectId): Record<string, unknown> {
    return {
      shop: shopId,
      status: 'delivered',
      payout: null,
      deliveredAt: { $lte: this.holdCutoff() },
      'returnRequest.status': { $ne: 'requested' },
    };
  }

  /**
   * Người bán nhận TIỀN HÀNG, không nhận phí vận chuyển — phí đó là của đơn vị
   * giao hàng, sàn chỉ thu hộ. Hoa hồng tính trên tiền hàng.
   */
  private amountsOf(orders: OrderDocument[]) {
    const gross = orders.reduce((sum, o) => sum + o.itemsTotal, 0);
    const commission = Math.round(gross * this.settings.get().commissionRate);
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
      this.sumOrders(this.payableFilter(shop._id)),
      // "Đang giữ": đã giao, chưa gom, NHƯNG chưa rút được — hoặc còn trong cửa
      // sổ trả hàng, hoặc đang có yêu cầu trả hàng chờ xử lý.
      this.sumOrders({
        shop: shop._id,
        status: 'delivered',
        payout: null,
        $or: [
          { deliveredAt: { $gt: cutoff } },
          { 'returnRequest.status': 'requested' },
        ],
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
      commissionRate: this.settings.get().commissionRate,
      holdDays: this.settings.get().payoutHoldDays,
      minPayout: MIN_PAYOUT_AMOUNT,
      canRequest:
        available.net >= MIN_PAYOUT_AMOUNT &&
        !!shop.bankAccount &&
        shop.status !== 'suspended',
      hasBankAccount: !!shop.bankAccount,
      suspended: shop.status === 'suspended',
      provider: { name: this.provider.name, isReal: this.provider.isReal },
    };
  }

  private async sumOrders(match: Record<string, unknown>) {
    const rows = await this.orderModel.aggregate<{
      gross: number;
      count: number;
    }>([
      { $match: match },
      {
        $group: {
          _id: null,
          gross: { $sum: '$itemsTotal' },
          count: { $sum: 1 },
        },
      },
    ]);
    const gross = rows[0]?.gross ?? 0;
    const commission = Math.round(gross * this.settings.get().commissionRate);
    return {
      gross,
      commission,
      net: gross - commission,
      count: rows[0]?.count ?? 0,
    };
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

    // Đóng băng tài chính trong lúc bị đình chỉ — đúng mục đích của đình chỉ
    // (chờ điều tra), không để shop rút hết tiền trước khi có kết luận.
    if (shop.status === 'suspended') {
      throw new ForbiddenException(
        'Gian hàng đang bị đình chỉ nên không thể rút tiền. Số dư vẫn được giữ nguyên.',
      );
    }

    if (!shop.bankAccount) {
      throw new BadRequestException(
        'Vui lòng liên kết tài khoản ngân hàng trước khi rút tiền.',
      );
    }

    const payoutId = new Types.ObjectId();
    // Dựng bất biến để TS suy kiểu (mongoose 9 bỏ `FilterQuery`); giữ ĐỒNG BỘ
    // với `payableFilter` — cùng một điều kiện "đơn đủ để chi trả".
    const claim = await this.orderModel.updateMany(
      {
        shop: shop._id,
        status: 'delivered',
        payout: null,
        deliveredAt: { $lte: this.holdCutoff() },
        'returnRequest.status': { $ne: 'requested' },
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
        commissionRate: this.settings.get().commissionRate,
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
    return {
      payout: this.publicPayout(
        (await this.payoutModel.findById(payoutId)) as PayoutDocument,
      ),
    };
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

      if (result.status !== 'processing') {
        await this.finalizePayout(payout._id, {
          providerRef: result.providerRef,
          status: result.status,
          failureReason: result.failureReason,
        });
      }
    } catch (e: unknown) {
      // Không rõ lệnh đã đi hay chưa → GIỮ nguyên `processing` và giữ đơn.
      // Nhả đơn lúc này có nguy cơ chuyển tiền hai lần cho cùng số đơn. Từ đây
      // chỉ còn cách đối soát thủ công (xem `adminCheckStatus`/`adminForceResolve`).
      this.logger.error(
        `Lỗi khi gửi lệnh chi trả ${payout.code}, cần đối soát thủ công: ${String(e)}`,
      );
      throw new BadRequestException(
        'Không gửi được lệnh chuyển tiền. Yêu cầu đang được xử lý, vui lòng kiểm tra lại sau.',
      );
    }
  }

  /**
   * Chốt kết quả cuối (`paid`/`failed`) cho một đợt chi đang ở `processing` —
   * dùng chung giữa luồng tự động (`sendTransfer` nhận kết quả trực tiếp từ
   * nhà cung cấp) và luồng admin đối soát thủ công, để không có hai nơi tự
   * suy ra hệ quả (nhả đơn, báo người bán) khác nhau cho cùng một tình huống.
   *
   * Điều kiện `status: 'processing'` trong lệnh update là chốt chặn chống
   * chốt trùng: hai lệnh gọi đồng thời (vd admin bấm hai lần, hoặc vừa tự
   * động vừa admin cùng lúc) thì chỉ đúng MỘT lệnh khớp được điều kiện này,
   * lệnh còn lại nhận `matchedCount: 0` và không được phép nhả đơn/báo tin —
   * tránh nhả đơn đã thực sự được trả tiền (double payout) hoặc báo tin hai lần.
   */
  private async finalizePayout(
    payoutId: Types.ObjectId,
    result: {
      providerRef?: string;
      status: 'paid' | 'failed';
      failureReason?: string;
    },
  ): Promise<boolean> {
    const update = await this.payoutModel.updateOne(
      { _id: payoutId, status: 'processing' },
      {
        $set: {
          ...(result.providerRef ? { providerRef: result.providerRef } : {}),
          status: result.status,
          failureReason: result.failureReason,
          ...(result.status === 'paid' ? { paidAt: new Date() } : {}),
        },
      },
    );
    if (update.matchedCount === 0) return false;

    const payout = await this.payoutModel.findById(payoutId);
    if (result.status === 'failed') {
      // Nhả đơn ra để lần rút sau gom lại được — nếu giữ, tiền của người bán
      // bị kẹt vĩnh viễn vì đơn đã gắn vào một đợt chi thất bại.
      await this.orderModel.updateMany(
        { payout: payoutId },
        { $set: { payout: null } },
      );
      this.logger.error(
        `Chi trả ${String(payoutId)} thất bại: ${result.failureReason ?? 'không rõ'}`,
      );
      // Trước đây chỉ ghi log — seller không biết đợt rút của mình đã thất
      // bại, chỉ phát hiện khi tự vào xem lịch sử. Đối xứng với nhánh `paid`
      // bên dưới, đều phải báo tin dù kết quả tốt hay xấu.
      if (payout) {
        await this.notifications.notifyShop(payout.shop, {
          type: 'payout_failed',
          title: 'Rút tiền không thành công',
          body: `Đợt rút ${payout.code} — ${payout.netAmount.toLocaleString('vi-VN')}đ không chuyển được${
            result.failureReason ? `: ${result.failureReason}` : '.'
          } Đơn hàng liên quan đã được nhả lại, bạn có thể yêu cầu rút lại.`,
          link: `/finance`,
          data: { payoutCode: payout.code, amount: payout.netAmount },
        });
      }
    } else if (payout) {
      await this.notifications.notifyShop(payout.shop, {
        type: 'payout_paid',
        title: 'Đã chi trả vào tài khoản',
        body: `Đợt rút ${payout.code} — ${payout.netAmount.toLocaleString('vi-VN')}đ đã được chuyển tới tài khoản của bạn.`,
        link: `/finance`,
        data: { payoutCode: payout.code, amount: payout.netAmount },
      });
    }
    return true;
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
    return {
      items: items.map((p) => this.publicPayout(p)),
      total,
      page,
      limit,
    };
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

  /* -------------------------- Admin: đối soát ---------------------------- */

  /** Danh sách đợt chi TOÀN SÀN cho admin đối soát — không lọc theo shop nào. */
  async adminList(query: {
    status?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const term = query.q?.trim();

    const filter: Record<string, unknown> = {
      ...(query.status ? { status: query.status } : {}),
    };
    if (term) {
      const shopIds = await this.shopModel
        .find({ name: { $regex: escapeRegex(term), $options: 'i' } })
        .select('_id')
        .lean();
      filter.$or = [
        { code: { $regex: escapeRegex(term), $options: 'i' } },
        ...(shopIds.length
          ? [{ shop: { $in: shopIds.map((s) => s._id) } }]
          : []),
      ];
    }

    const [items, total, counts] = await Promise.all([
      this.payoutModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate<{ shop: { _id: Types.ObjectId; name: string } }>(
          'shop',
          'name',
        )
        .lean(),
      this.payoutModel.countDocuments(filter),
      this.countPayoutsByStatus(),
    ]);

    return {
      items: items.map((p) => this.adminPublicPayout(p)),
      total,
      page,
      limit,
      counts,
    };
  }

  async adminGetOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy đợt chi trả.');
    }
    const payout = await this.payoutModel
      .findById(id)
      .populate<{ shop: { _id: Types.ObjectId; name: string } }>('shop', 'name')
      .lean();
    if (!payout) throw new NotFoundException('Không tìm thấy đợt chi trả.');

    const orders = await this.orderModel
      .find({ payout: payout._id })
      .select('orderCode total deliveredAt')
      .lean();

    return {
      payout: this.adminPublicPayout(payout),
      orders: orders.map((o) => ({
        id: String(o._id),
        orderCode: o.orderCode,
        total: o.total,
        deliveredAt: o.deliveredAt,
      })),
    };
  }

  /**
   * Tra lại trạng thái thật từ nhà cung cấp cho đợt chi đang kẹt ở
   * `processing` — đường AN TOÀN nhất để gỡ kẹt vì dựa trên sự thật phía nhà
   * cung cấp thay vì admin tự phán đoán. Ưu tiên dùng trước `adminForceResolve`.
   */
  async adminCheckStatus(admin: AdminPrincipal, id: string) {
    const payout = await this.requireProcessingPayout(id);
    if (!payout.providerRef) {
      throw new BadRequestException(
        'Đợt chi này chưa có mã lệnh từ nhà cung cấp (lỗi xảy ra trước khi gửi được lệnh) — không tra cứu được, chỉ có thể chốt thủ công.',
      );
    }

    const status = await this.provider.getStatus(payout.providerRef);
    if (status === 'processing') {
      return {
        changed: false,
        payout: this.adminPublicPayout(await this.mustFindPayout(id)),
      };
    }

    const changed = await this.finalizePayout(payout._id, {
      providerRef: payout.providerRef,
      status,
      failureReason:
        status === 'failed'
          ? 'Nhà cung cấp xác nhận thất bại (tra cứu thủ công bởi admin).'
          : undefined,
    });
    if (!changed) {
      throw new ConflictException(
        'Đợt chi này vừa được xử lý bởi thao tác khác, vui lòng tải lại.',
      );
    }

    await this.auditLog.log({
      adminEmail: admin.email,
      action:
        status === 'paid'
          ? 'Xác nhận đợt chi thành công (tra cứu nhà cung cấp)'
          : 'Xác nhận đợt chi thất bại (tra cứu nhà cung cấp)',
      targetLabel: payout.code,
    });

    return {
      changed: true,
      payout: this.adminPublicPayout(await this.mustFindPayout(id)),
    };
  }

  /**
   * Chốt thủ công (KHÔNG qua tra cứu nhà cung cấp) — chỉ dùng khi
   * `adminCheckStatus` không tra được (vd chưa có `providerRef`, hoặc nhà
   * cung cấp không phản hồi). Bắt buộc ghi lý do vì đây là quyết định thay
   * cho sự thật của nhà cung cấp — cần vết để đối chiếu lại nếu sai.
   */
  async adminForceResolve(
    admin: AdminPrincipal,
    id: string,
    action: 'paid' | 'failed',
    note: string,
  ) {
    const payout = await this.requireProcessingPayout(id);

    await this.payoutModel.updateOne(
      { _id: payout._id },
      {
        $set: {
          adminResolutionNote: note,
          resolvedByAdminEmail: admin.email,
        },
      },
    );

    const changed = await this.finalizePayout(payout._id, {
      status: action,
      failureReason: action === 'failed' ? note : undefined,
    });
    if (!changed) {
      throw new ConflictException(
        'Đợt chi này vừa được xử lý bởi thao tác khác, vui lòng tải lại.',
      );
    }

    await this.auditLog.log({
      adminEmail: admin.email,
      action:
        action === 'paid'
          ? 'Chốt thủ công: đợt chi ĐÃ chuyển thành công'
          : 'Chốt thủ công: đợt chi THẤT BẠI',
      targetLabel: payout.code,
      detail: note,
    });

    return { payout: this.adminPublicPayout(await this.mustFindPayout(id)) };
  }

  private async requireProcessingPayout(id: string): Promise<PayoutDocument> {
    const payout = await this.mustFindPayout(id);
    if (payout.status !== 'processing') {
      throw new BadRequestException(
        'Chỉ đối soát được đợt chi đang ở trạng thái "đang xử lý" — đợt này đã có kết quả cuối cùng.',
      );
    }
    return payout;
  }

  private async mustFindPayout(id: string): Promise<PayoutDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy đợt chi trả.');
    }
    const payout = await this.payoutModel.findById(id);
    if (!payout) throw new NotFoundException('Không tìm thấy đợt chi trả.');
    return payout;
  }

  private async countPayoutsByStatus() {
    const rows = await this.payoutModel.aggregate<{
      _id: PayoutStatus;
      n: number;
    }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    const counts: Record<string, number> = { all: 0 };
    for (const r of rows) {
      counts[r._id] = r.n;
      counts.all += r.n;
    }
    return counts;
  }

  /** Trình bày cho admin — KHÔNG che số tài khoản (khác `publicPayout` phía người bán) vì admin cần đối chiếu với sao kê ngân hàng thật. */
  private adminPublicPayout(
    p: Omit<Payout, 'shop'> & {
      _id: Types.ObjectId;
      createdAt?: Date;
      shop: Types.ObjectId | { _id: Types.ObjectId; name: string };
    },
  ) {
    const shop =
      p.shop && typeof p.shop === 'object' && 'name' in p.shop
        ? { id: String(p.shop._id), name: p.shop.name }
        : { id: String(p.shop), name: '(Gian hàng đã xoá)' };

    return {
      id: String(p._id),
      code: p.code,
      shop,
      orderCount: p.orders.length,
      grossAmount: p.grossAmount,
      commissionAmount: p.commissionAmount,
      commissionRate: p.commissionRate,
      netAmount: p.netAmount,
      status: p.status,
      bankName: p.bankAccount.bankName,
      accountNumber: p.bankAccount.accountNumber,
      accountHolderName: p.bankAccount.accountHolderName,
      provider: p.provider,
      providerRef: p.providerRef,
      paidAt: p.paidAt,
      failureReason: p.failureReason,
      adminResolutionNote: p.adminResolutionNote,
      resolvedByAdminEmail: p.resolvedByAdminEmail,
      createdAt: p.createdAt,
    };
  }
}

/** Chặn ký tự đặc biệt của regex trong từ khoá tìm kiếm do người dùng nhập. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskTail(s: string): string {
  return s.length <= 4 ? s : `${'•'.repeat(s.length - 4)}${s.slice(-4)}`;
}
