import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Voucher, VoucherDocument, VoucherRedemption, VoucherRedemptionDocument } from './schemas/voucher.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { CreateVoucherDto, ListVouchersDto } from './dto/voucher.dto';
import { isDealLive, isDealScheduled } from '../products/deal';
import type { UserDocument } from '../users/schemas/user.schema';

/** Khớp `PromotionsService` — cùng loại ràng buộc thời gian cho một chương trình có hạn. */
const MIN_DURATION_MINUTES = 15;
const MAX_AHEAD_DAYS = 180;

export interface ResolvedVoucher {
  voucherId: Types.ObjectId;
  code: string;
  discount: number;
}

/**
 * Mã giảm giá của gian hàng.
 *
 * Khác `PromotionsService` (giảm giá NIÊM YẾT trên từng sản phẩm): voucher áp
 * lên TỔNG tiền hàng của cả nhóm đơn thuộc một shop, người mua phải chủ động
 * nhập mã lúc thanh toán. Dùng chung một "khoá giành lượt" kiểu atomic
 * `updateOne` với `CartService`/`OrdersService` — không transaction, không
 * replica set — nên mọi thao tác đổi số đếm đều phải tự đứng vững một mình.
 */
@Injectable()
export class VouchersService {
  constructor(
    @InjectModel(Voucher.name) private readonly voucherModel: Model<VoucherDocument>,
    @InjectModel(VoucherRedemption.name)
    private readonly redemptionModel: Model<VoucherRedemptionDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
  ) {}

  private async requireShop(user: UserDocument): Promise<ShopDocument> {
    const shop = await this.shopModel.findOne({ owner: user._id });
    if (!shop) throw new ForbiddenException('Tài khoản chưa có gian hàng.');
    if (shop.status === 'suspended') {
      throw new ForbiddenException(
        'Gian hàng đang bị tạm đình chỉ, không thể thao tác mã giảm giá.',
      );
    }
    return shop;
  }

  private async findOwned(user: UserDocument, id: string): Promise<VoucherDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy mã giảm giá.');
    }
    const shop = await this.requireShop(user);
    const voucher = await this.voucherModel.findOne({ _id: id, shop: shop._id });
    if (!voucher) throw new NotFoundException('Không tìm thấy mã giảm giá.');
    return voucher;
  }

  /* -------------------------------- Người bán ------------------------------ */

  async create(user: UserDocument, dto: CreateVoucherDto) {
    const shop = await this.requireShop(user);

    const code = dto.code.trim().toUpperCase();
    const exists = await this.voucherModel.exists({ shop: shop._id, code });
    if (exists) {
      throw new BadRequestException(`Mã "${code}" đã tồn tại ở gian hàng của bạn.`);
    }

    if (dto.type === 'percent' && dto.value > 100) {
      throw new BadRequestException('Giảm theo phần trăm tối đa 100%.');
    }

    const now = Date.now();
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : undefined;
    const endsAt = new Date(dto.endsAt);

    if (endsAt.getTime() <= now) {
      throw new BadRequestException('Thời gian kết thúc phải ở tương lai.');
    }
    if (endsAt.getTime() > now + MAX_AHEAD_DAYS * 86_400_000) {
      throw new BadRequestException(
        `Chỉ đặt trước tối đa ${MAX_AHEAD_DAYS} ngày.`,
      );
    }
    if (startsAt && startsAt.getTime() >= endsAt.getTime()) {
      throw new BadRequestException(
        'Thời gian bắt đầu phải trước thời gian kết thúc.',
      );
    }
    const from = startsAt && startsAt.getTime() > now ? startsAt.getTime() : now;
    if (endsAt.getTime() - from < MIN_DURATION_MINUTES * 60_000) {
      throw new BadRequestException(
        `Mã phải còn hiệu lực ít nhất ${MIN_DURATION_MINUTES} phút.`,
      );
    }

    const voucher = await this.voucherModel.create({
      shop: shop._id,
      code,
      description: dto.description?.trim(),
      type: dto.type,
      value: dto.value,
      maxDiscount: dto.type === 'percent' ? dto.maxDiscount : undefined,
      minOrderValue: dto.minOrderValue ?? 0,
      startsAt,
      endsAt,
      usageLimit: dto.usageLimit ?? null,
      perBuyerLimit: dto.perBuyerLimit ?? 1,
    });

    return { voucher: this.sellerShape(voucher) };
  }

  async list(user: UserDocument, query: ListVouchersDto) {
    const shop = await this.requireShop(user);
    const vouchers = await this.voucherModel
      .find({ shop: shop._id })
      .sort({ createdAt: -1 })
      .limit(200);

    const all = vouchers.map((v) => this.sellerShape(v));
    const counts = {
      live: all.filter((v) => v.state === 'live').length,
      scheduled: all.filter((v) => v.state === 'scheduled').length,
      ended: all.filter((v) => v.state === 'ended').length,
    };

    const tab = query.tab ?? 'all';
    return {
      items: tab === 'all' ? all : all.filter((v) => v.state === tab),
      counts: { ...counts, all: all.length },
    };
  }

  /** Kết thúc sớm — giữ lại bản ghi để còn tra lịch sử, không xoá hẳn. */
  async end(user: UserDocument, id: string) {
    const voucher = await this.findOwned(user, id);
    if (voucher.ended) {
      throw new BadRequestException('Mã này đã kết thúc trước đó.');
    }
    voucher.ended = true;
    await voucher.save();
    return { ok: true };
  }

  /* -------------------------------- Người mua ------------------------------ */

  /** Mã đang CÒN DÙNG ĐƯỢC của một shop — hiện ở trang shop/checkout. */
  async publicListForShop(shopId: string) {
    if (!Types.ObjectId.isValid(shopId)) return { items: [] };
    const now = new Date();
    const vouchers = await this.voucherModel
      .find({
        shop: shopId,
        ended: false,
        endsAt: { $gt: now },
        $or: [{ startsAt: { $exists: false } }, { startsAt: { $lte: now } }],
      })
      .sort({ endsAt: 1 })
      .limit(50);

    return { items: vouchers.map((v) => this.publicShape(v)) };
  }

  /**
   * Kiểm mã có áp được cho đúng shop + đúng người mua + đúng tổng tiền hàng
   * hay không — KHÔNG ghi gì, dùng cả cho xem trước (`preview`) lẫn bên trong
   * `OrdersService.buildGroups` (nguồn tính duy nhất cho báo giá VÀ đặt hàng,
   * cùng triết lý với `dealPrice`/`isDealLive`: một nơi tính, mọi nơi đọc).
   */
  async resolveForCheckout(
    shopId: Types.ObjectId,
    buyerId: Types.ObjectId,
    rawCode: string,
    itemsTotal: number,
  ): Promise<ResolvedVoucher> {
    const code = rawCode.trim().toUpperCase();
    const voucher = await this.voucherModel.findOne({ shop: shopId, code });
    if (!voucher) {
      throw new BadRequestException(`Mã "${code}" không tồn tại ở gian hàng này.`);
    }
    if (voucher.ended) {
      throw new BadRequestException(`Mã "${code}" đã kết thúc.`);
    }
    if (isDealScheduled(voucher)) {
      throw new BadRequestException(`Mã "${code}" chưa tới thời gian áp dụng.`);
    }
    if (!isDealLive(voucher)) {
      throw new BadRequestException(`Mã "${code}" đã hết hạn.`);
    }
    if (itemsTotal < voucher.minOrderValue) {
      throw new BadRequestException(
        `Mã "${code}" áp dụng cho đơn từ ${voucher.minOrderValue.toLocaleString('vi-VN')}đ trở lên.`,
      );
    }
    if (voucher.usageLimit != null && voucher.usedCount >= voucher.usageLimit) {
      throw new BadRequestException(`Mã "${code}" đã hết lượt sử dụng.`);
    }
    const usedByBuyer = await this.redemptionModel.countDocuments({
      voucher: voucher._id,
      buyer: buyerId,
    });
    if (usedByBuyer >= voucher.perBuyerLimit) {
      throw new BadRequestException(`Bạn đã dùng hết lượt cho mã "${code}".`);
    }

    return {
      voucherId: voucher._id,
      code: voucher.code,
      discount: this.computeDiscount(voucher, itemsTotal),
    };
  }

  /**
   * Giành một lượt dùng — atomic trên `usedCount` (chặn vượt `usageLimit` khi
   * nhiều người bấm gần như cùng lúc, cùng cơ chế với `reserveStock`).
   *
   * 🔴 `perBuyerLimit` KHÔNG được khoá atomic ở đây (đã kiểm ở
   * `resolveForCheckout` ngay trước đó, nhưng còn một khe hở đua hiếm giữa hai
   * bước) — chấp nhận vì hậu quả tối đa là một người dùng mã thêm một lần so
   * với giới hạn CỦA CHÍNH SHOP đặt ra (tự chịu chi phí), không phải lỗ hổng
   * ảnh hưởng người khác hay rút được tiền — khác hẳn mức độ nghiêm trọng của
   * việc bán vượt tồn kho.
   */
  async redeem(
    voucherId: Types.ObjectId,
    shopId: Types.ObjectId,
    buyerId: Types.ObjectId,
    checkoutGroup: Types.ObjectId,
    discountAmount: number,
  ): Promise<Types.ObjectId> {
    const voucher = await this.voucherModel.findById(voucherId).select('usageLimit');
    const filter: Record<string, unknown> = { _id: voucherId, ended: false };
    if (voucher?.usageLimit != null) {
      filter.usedCount = { $lt: voucher.usageLimit };
    }
    const res = await this.voucherModel.updateOne(filter, { $inc: { usedCount: 1 } });
    if (res.modifiedCount !== 1) {
      throw new ConflictException(
        'Mã giảm giá vừa hết lượt sử dụng. Vui lòng bỏ mã hoặc thử lại.',
      );
    }

    const redemption = await this.redemptionModel.create({
      voucher: voucherId,
      shop: shopId,
      buyer: buyerId,
      checkoutGroup,
      discountAmount,
    });
    return redemption._id;
  }

  /** Trả lại một lượt đã giành — dùng khi tạo đơn thất bại giữa chừng (đền bù, giống `releaseStock`). */
  async release(voucherId: Types.ObjectId, redemptionId: Types.ObjectId): Promise<void> {
    await this.voucherModel.updateOne({ _id: voucherId }, { $inc: { usedCount: -1 } });
    await this.redemptionModel.deleteOne({ _id: redemptionId });
  }

  /* -------------------------------- Tính toán ------------------------------ */

  private computeDiscount(
    voucher: Pick<Voucher, 'type' | 'value' | 'maxDiscount'>,
    itemsTotal: number,
  ): number {
    let raw =
      voucher.type === 'percent'
        ? Math.floor((itemsTotal * voucher.value) / 100)
        : voucher.value;
    if (voucher.type === 'percent' && voucher.maxDiscount) {
      raw = Math.min(raw, voucher.maxDiscount);
    }
    // Không bao giờ giảm quá tiền hàng — đơn không thể có tổng âm.
    return Math.max(0, Math.min(raw, itemsTotal));
  }

  private stateOf(v: Pick<Voucher, 'ended' | 'startsAt' | 'endsAt'>): 'live' | 'scheduled' | 'ended' {
    if (v.ended) return 'ended';
    if (isDealLive(v)) return 'live';
    if (isDealScheduled(v)) return 'scheduled';
    return 'ended';
  }

  private sellerShape(v: VoucherDocument) {
    return {
      id: String(v._id),
      code: v.code,
      description: v.description,
      type: v.type,
      value: v.value,
      maxDiscount: v.maxDiscount,
      minOrderValue: v.minOrderValue,
      startsAt: v.startsAt,
      endsAt: v.endsAt,
      usageLimit: v.usageLimit,
      usedCount: v.usedCount,
      perBuyerLimit: v.perBuyerLimit,
      state: this.stateOf(v),
    };
  }

  private publicShape(v: VoucherDocument) {
    return {
      id: String(v._id),
      code: v.code,
      description: v.description,
      type: v.type,
      value: v.value,
      maxDiscount: v.maxDiscount,
      minOrderValue: v.minOrderValue,
      endsAt: v.endsAt,
    };
  }
}
