import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { ListDealsDto, SetDealDto } from './dto/promotion.dto';
import { isDealLive, isDealScheduled } from './deal';
import type { UserDocument } from '../users/schemas/user.schema';

/** Khuyến mãi ngắn hơn mức này thì người mua chưa kịp thấy đã hết. */
const MIN_DURATION_MINUTES = 15;

/** Đặt trước quá xa thì thường là gõ nhầm năm. */
const MAX_AHEAD_DAYS = 180;

/**
 * Khuyến mãi theo sản phẩm.
 *
 * Toàn bộ đường ống đã có sẵn từ trước — `Product.activeDeal` để lưu,
 * `catalog.service` để hiển thị, `orders.service.dealPrice()` để tính tiền.
 * Trước đợt này KHÔNG có nơi nào GHI vào `activeDeal`, nên badge giảm giá và
 * đồng hồ đếm ngược trên thẻ sản phẩm là code chết. Đây là cái vòi còn thiếu.
 */
@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name);

  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
  ) {}

  private async requireShop(user: UserDocument): Promise<ShopDocument> {
    const shop = await this.shopModel.findOne({ owner: user._id });
    if (!shop) throw new ForbiddenException('Tài khoản chưa có gian hàng.');
    return shop;
  }

  private async findOwnedProduct(user: UserDocument, productId: string) {
    if (!Types.ObjectId.isValid(productId)) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }
    const shop = await this.requireShop(user);
    const product = await this.productModel.findOne({
      _id: productId,
      shop: shop._id,
      deletedAt: null,
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm.');
    return product;
  }

  /* ------------------------------ Đặt lịch ------------------------------- */

  /**
   * Đặt hoặc cập nhật khuyến mãi cho một sản phẩm.
   *
   * 🔴 `price` bắt buộc THẤP HƠN `priceMin`. Thẻ sản phẩm tính phần trăm giảm
   * và vẽ giá gạch ngang đều dựa trên `priceMin`; giá sale cao hơn nó sẽ hiện
   * "giá khuyến mãi" đắt hơn "giá gốc". Ngoài ra `dealPrice()` bỏ qua khuyến
   * mãi không rẻ hơn giá niêm yết, nên một khuyến mãi như vậy còn chẳng có tác
   * dụng gì ngoài việc làm người bán tưởng mình đang chạy sale.
   */
  async setDeal(user: UserDocument, productId: string, dto: SetDealDto) {
    const product = await this.findOwnedProduct(user, productId);

    if (product.status !== 'active') {
      throw new BadRequestException(
        'Chỉ đặt khuyến mãi được cho sản phẩm đang bán.',
      );
    }
    if (product.priceMin <= 0) {
      throw new BadRequestException(
        'Sản phẩm chưa có phân loại nào đang bán để đặt khuyến mãi.',
      );
    }
    if (dto.price >= product.priceMin) {
      throw new BadRequestException(
        `Giá khuyến mãi phải thấp hơn ${product.priceMin.toLocaleString('vi-VN')}đ — ` +
          'giá của phân loại rẻ nhất.',
      );
    }

    const now = Date.now();
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : undefined;
    const endsAt = new Date(dto.endsAt);

    if (endsAt.getTime() <= now) {
      throw new BadRequestException('Thời gian kết thúc phải ở tương lai.');
    }
    if (endsAt.getTime() > now + MAX_AHEAD_DAYS * 86_400_000) {
      throw new BadRequestException(
        `Khuyến mãi chỉ đặt trước tối đa ${MAX_AHEAD_DAYS} ngày.`,
      );
    }
    if (startsAt) {
      if (startsAt.getTime() >= endsAt.getTime()) {
        throw new BadRequestException(
          'Thời gian bắt đầu phải trước thời gian kết thúc.',
        );
      }
      if (startsAt.getTime() > now + MAX_AHEAD_DAYS * 86_400_000) {
        throw new BadRequestException(
          `Khuyến mãi chỉ đặt trước tối đa ${MAX_AHEAD_DAYS} ngày.`,
        );
      }
    }

    // Đo từ lúc THỰC SỰ bắt đầu, không phải từ bây giờ.
    const from =
      startsAt && startsAt.getTime() > now ? startsAt.getTime() : now;
    if (endsAt.getTime() - from < MIN_DURATION_MINUTES * 60_000) {
      throw new BadRequestException(
        `Khuyến mãi phải kéo dài ít nhất ${MIN_DURATION_MINUTES} phút.`,
      );
    }

    product.activeDeal = { price: dto.price, startsAt, endsAt };
    await product.save();

    return { product: this.publicDeal(product) };
  }

  /**
   * Kết thúc khuyến mãi ngay lập tức.
   *
   * Xoá hẳn `activeDeal` chứ không lùi `endsAt` về quá khứ: giữ lại một khuyến
   * mãi chết trong dữ liệu chỉ tổ làm mọi truy vấn "sản phẩm đang sale" phải
   * lọc thêm một tầng.
   */
  async endDeal(user: UserDocument, productId: string) {
    const product = await this.findOwnedProduct(user, productId);
    if (!product.activeDeal) {
      throw new BadRequestException('Sản phẩm này không có khuyến mãi nào.');
    }

    product.activeDeal = undefined;
    await product.save();
    return { ok: true };
  }

  /* ------------------------------ Danh sách ------------------------------ */

  async list(user: UserDocument, query: ListDealsDto) {
    const shop = await this.requireShop(user);

    const products = await this.productModel
      .find({ shop: shop._id, deletedAt: null, activeDeal: { $ne: null } })
      .select('name slug images priceMin priceMax totalStock status activeDeal')
      .sort({ 'activeDeal.endsAt': 1 })
      .limit(200);

    const all = products.map((p) => this.publicDeal(p));
    const counts = {
      live: all.filter((p) => p.state === 'live').length,
      scheduled: all.filter((p) => p.state === 'scheduled').length,
      ended: all.filter((p) => p.state === 'ended').length,
    };

    const tab = query.tab ?? 'all';
    return {
      items: tab === 'all' ? all : all.filter((p) => p.state === tab),
      counts: { ...counts, all: all.length },
    };
  }

  /** Sản phẩm đang bán mà CHƯA có khuyến mãi — nguồn cho ô chọn sản phẩm. */
  async selectable(user: UserDocument) {
    const shop = await this.requireShop(user);
    const products = await this.productModel
      .find({
        shop: shop._id,
        deletedAt: null,
        status: 'active',
        $or: [{ activeDeal: null }, { activeDeal: { $exists: false } }],
      })
      .select('name images priceMin priceMax')
      .sort({ updatedAt: -1 })
      .limit(200);

    return {
      items: products.map((p) => ({
        id: String(p._id),
        name: p.name,
        image: p.images?.[0]?.url,
        priceMin: p.priceMin,
        priceMax: p.priceMax,
      })),
    };
  }

  /* -------------------------------- Dọn dẹp ------------------------------ */

  /**
   * Xoá khuyến mãi đã hết hạn.
   *
   * Không bắt buộc cho tính đúng — `isDealLive` đã lọc ở cả hai nơi đọc — nhưng
   * để rác lại thì mọi câu hỏi "sản phẩm nào đang sale" đều phải quét toàn bộ
   * rồi lọc trong bộ nhớ.
   */
  async clearExpiredDeals(now = new Date()): Promise<number> {
    const res = await this.productModel.updateMany(
      { 'activeDeal.endsAt': { $lte: now } },
      { $unset: { activeDeal: '' } },
    );
    if (res.modifiedCount) {
      this.logger.log(`Đã dọn ${res.modifiedCount} khuyến mãi hết hạn.`);
    }
    return res.modifiedCount;
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleClearExpired() {
    try {
      await this.clearExpiredDeals();
    } catch (err: unknown) {
      this.logger.warn(`Dọn khuyến mãi hết hạn thất bại: ${String(err)}`);
    }
  }

  /* ------------------------------ Hiển thị ------------------------------- */

  private publicDeal(p: ProductDocument) {
    const deal = p.activeDeal;
    const state = !deal
      ? 'ended'
      : isDealLive(deal)
        ? 'live'
        : isDealScheduled(deal)
          ? 'scheduled'
          : 'ended';

    return {
      productId: String(p._id),
      name: p.name,
      slug: p.slug,
      image: p.images?.[0]?.url,
      priceMin: p.priceMin,
      priceMax: p.priceMax,
      totalStock: p.totalStock,
      status: p.status,
      state,
      deal: deal
        ? {
            price: deal.price,
            startsAt: deal.startsAt,
            endsAt: deal.endsAt,
            // Tính sẵn ở server để hai app không tự tính ra hai con số khác nhau.
            discountPercent: Math.round(
              ((p.priceMin - deal.price) / p.priceMin) * 100,
            ),
          }
        : undefined,
    };
  }
}
