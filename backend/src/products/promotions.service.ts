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
import {
  AdminListPromotionsDto,
  ListDealsDto,
  SetDealDto,
} from './dto/promotion.dto';
import { isDealLive, isDealScheduled } from './deal';
import { PriceHistoryService } from './price-history.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FollowsService } from '../follows/follows.service';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import type { UserDocument } from '../users/schemas/user.schema';

/**
 * Giá gốc cao hơn giá tham chiếu (xem `PriceHistoryService`) từ mức này trở
 * lên mới đáng nghi — chênh lệch nhỏ (làm tròn, phí ship gộp giá...) là bình
 * thường, không phải dấu hiệu dựng giá ảo.
 */
const HIKE_FLAG_THRESHOLD_PERCENT = 10;

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
    private readonly priceHistory: PriceHistoryService,
    private readonly notifications: NotificationsService,
    private readonly auditLog: AuditLogService,
    private readonly follows: FollowsService,
  ) {}

  private async requireShop(user: UserDocument): Promise<ShopDocument> {
    const shop = await this.shopModel.findOne({ owner: user._id });
    if (!shop) throw new ForbiddenException('Tài khoản chưa có gian hàng.');
    // Cùng chính sách với ProductsService.requireShop: đình chỉ thì không thao
    // tác được gì trên sản phẩm, kể cả đặt/gỡ khuyến mãi.
    if (shop.status === 'suspended') {
      throw new ForbiddenException(
        'Gian hàng đang bị tạm đình chỉ, không thể thao tác khuyến mãi.',
      );
    }
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
    if (product.moderation?.state !== 'ok') {
      throw new BadRequestException(
        'Sản phẩm đang chờ kiểm duyệt hoặc chưa đạt yêu cầu, chưa thể đặt khuyến mãi.',
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

    // Nghi ngờ giá ảo: `priceMin` (giá gốc dùng để tính % giảm) vừa bị tăng
    // ngay trước khi đặt sale này. KHÔNG chặn — chỉ đánh dấu để admin xét,
    // tránh cản oan các đợt sale thật (xem PriceHistoryService để biết lý do
    // "không đủ dữ liệu" luôn được xử lý an toàn về phía không nghi ngờ).
    const hike = await this.priceHistory.findPreHikeReference(product._id);
    let flagged = false;
    let flagReason: string | undefined;
    if (
      hike &&
      product.priceMin > hike.referenceLow * (1 + HIKE_FLAG_THRESHOLD_PERCENT / 100)
    ) {
      flagged = true;
      const hoursAgo = Math.max(
        1,
        Math.round((now - hike.latestChangeAt.getTime()) / 3_600_000),
      );
      flagReason =
        `Giá gốc vừa tăng từ ${hike.referenceLow.toLocaleString('vi-VN')}đ lên ` +
        `${product.priceMin.toLocaleString('vi-VN')}đ khoảng ${hoursAgo} giờ trước khi đặt khuyến mãi này.`;
    }

    // "Mới" = trước đó chưa có deal nào — SỬA một deal đang chạy (đổi giá/hạn)
    // không tính, để không báo follower liên tục vì một chỉnh sửa nhỏ.
    const isNewDeal = !product.activeDeal;

    product.activeDeal = { price: dto.price, startsAt, endsAt, flagged, flagReason };
    await product.save();

    // Chỉ báo follower khi deal ĐANG SỐNG ngay lúc đặt (không phải đặt lịch
    // cho tương lai) — "vừa có khuyến mãi" mà thật ra vài tháng nữa mới chạy
    // thì gây hiểu lầm.
    if (isNewDeal && isDealLive(product.activeDeal)) {
      await this.follows.notifyNewPromotion(product.shop, {
        id: product._id,
        name: product.name,
        slug: product.slug,
      });
    }

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
      .select(
        'name slug images variants priceMin priceMax totalStock status activeDeal',
      )
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
      .select('name images variants priceMin priceMax')
      .sort({ updatedAt: -1 })
      .limit(200);

    return {
      items: products.map((p) => ({
        id: String(p._id),
        name: p.name,
        image: p.images?.[0]?.url ?? p.variants?.find((v) => v.image)?.image,
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

  /* -------------------------------- Admin --------------------------------- */

  /**
   * Toàn bộ khuyến mãi trên sàn (mọi shop) cho trang kiểm duyệt của admin —
   * khác `list()` (chỉ khuyến mãi của MỘT shop), có thêm tên gian hàng và cờ
   * nghi ngờ giá ảo.
   */
  async adminList(query: AdminListPromotionsDto) {
    const products = await this.productModel
      .find({ activeDeal: { $ne: null } })
      .select(
        'name slug images variants shop priceMin priceMax totalStock status activeDeal',
      )
      .sort({ 'activeDeal.endsAt': 1 })
      // KHÔNG giới hạn số lượng — trang này tự nhận là "số đếm phản ánh TOÀN
      // BỘ khuyến mãi", giới hạn cứng sẽ âm thầm cắt mất khuyến mãi (kể cả
      // đang bị nghi ngờ giá ảo) một khi sàn có hơn N deal cùng lúc.
      .populate<{ shop: { _id: Types.ObjectId; name: string } }>('shop', 'name')
      .lean();

    const all = products.map((p) => this.adminShapeDeal(p));
    // Số đếm trên tab luôn phản ánh TOÀN BỘ khuyến mãi — không đổi theo ô tìm
    // kiếm, để admin biết chính xác quy mô mỗi mục dù đang lọc theo từ khoá gì.
    const counts = {
      live: all.filter((p) => p.state === 'live').length,
      scheduled: all.filter((p) => p.state === 'scheduled').length,
      flagged: all.filter((p) => p.flagged).length,
    };

    const term = query.q?.trim().toLowerCase();
    const searched = term
      ? all.filter(
          (p) =>
            p.name.toLowerCase().includes(term) ||
            p.shop.name.toLowerCase().includes(term),
        )
      : all;

    const tab = query.tab ?? 'all';
    const items =
      tab === 'all'
        ? searched
        : tab === 'flagged'
          ? searched.filter((p) => p.flagged)
          : searched.filter((p) => p.state === tab);

    return { items, counts: { ...counts, all: all.length } };
  }

  /**
   * Chi tiết một khuyến mãi cho admin — đủ thông tin sản phẩm + gian hàng để
   * xét đoán nhanh mà không phải mở nhiều tab (số liệu bán/đánh giá của sản
   * phẩm, tiền án đình chỉ của shop...), không cần thêm truy vấn chéo module
   * nào (toàn bộ đã có sẵn trên chính `Product`/`Shop`).
   */
  async adminGetDealDetail(productId: string) {
    if (!Types.ObjectId.isValid(productId)) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }
    const product = await this.productModel
      .findById(productId)
      .populate<{
        shop: {
          _id: Types.ObjectId;
          name: string;
          logoUrl?: string;
          status: string;
          suspendedUntil?: Date | null;
          businessType: string;
          description?: string;
          contactName: string;
          contactPhone: string;
          contactEmail?: string;
        };
      }>(
        'shop',
        'name logoUrl status suspendedUntil businessType description contactName contactPhone contactEmail',
      )
      .lean();
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm.');
    if (!product.activeDeal) {
      throw new BadRequestException('Sản phẩm này không có khuyến mãi nào.');
    }

    const deal = product.activeDeal;
    const state = isDealLive(deal) ? 'live' : isDealScheduled(deal) ? 'scheduled' : 'ended';

    return {
      product: {
        id: String(product._id),
        name: product.name,
        description: product.description,
        images: product.images?.map((i) => i.url) ?? [],
        priceMin: product.priceMin,
        priceMax: product.priceMax,
        totalStock: product.totalStock,
        status: product.status,
        moderationState: product.moderation?.state,
        stats: {
          sold: product.stats?.sold ?? 0,
          views: product.stats?.views ?? 0,
          favorites: product.stats?.favorites ?? 0,
          ratingAvg: product.stats?.ratingAvg ?? 0,
          ratingCount: product.stats?.ratingCount ?? 0,
        },
        createdAt: (product as unknown as { createdAt?: Date }).createdAt,
      },
      shop: {
        id: String(product.shop._id),
        name: product.shop.name,
        logoUrl: product.shop.logoUrl,
        status: product.shop.status,
        suspendedUntil: product.shop.suspendedUntil,
        businessType: product.shop.businessType,
        description: product.shop.description,
        contactName: product.shop.contactName,
        contactPhone: product.shop.contactPhone,
        contactEmail: product.shop.contactEmail,
      },
      deal: {
        price: deal.price,
        startsAt: deal.startsAt,
        endsAt: deal.endsAt,
        discountPercent: this.discountPercentOf(product.priceMin, deal.price),
        flagged: !!deal.flagged,
        flagReason: deal.flagReason,
      },
      state,
    };
  }

  /**
   * Admin kết thúc khuyến mãi ngay lập tức — cùng cơ chế `endDeal()` (xoá hẳn
   * `activeDeal`, không lùi `endsAt`), khác ở chỗ không giới hạn theo shop sở
   * hữu và có báo shop + ghi nhật ký. Đơn đã bán trong lúc khuyến mãi còn hiệu
   * lực giữ nguyên giá đã chốt lúc mua (snapshot trên `Order`), không bị ảnh
   * hưởng ngược.
   */
  async adminEndDeal(admin: AdminPrincipal, productId: string) {
    if (!Types.ObjectId.isValid(productId)) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }
    // Atomic: điều kiện "còn khuyến mãi" nằm trong filter, tránh 2 tab admin
    // cùng bấm "Kết thúc" trên một deal cho ra 2 thông báo/2 dòng audit log.
    const product = await this.productModel.findOneAndUpdate(
      { _id: productId, activeDeal: { $ne: null } },
      { $unset: { activeDeal: '' } },
      { new: false }, // lấy document TRƯỚC khi xoá để còn giá/lý do gắn cờ mà báo shop
    );
    if (!product) {
      const exists = await this.productModel.exists({ _id: productId });
      if (!exists) throw new NotFoundException('Không tìm thấy sản phẩm.');
      throw new BadRequestException('Sản phẩm này không có khuyến mãi nào.');
    }

    const deal = product.activeDeal!;

    await this.notifications.notifyShop(product.shop, {
      type: 'promotion_ended_by_admin',
      title: 'Khuyến mãi của bạn đã bị admin kết thúc',
      body:
        `Khuyến mãi cho sản phẩm "${product.name}" (giá ${deal.price.toLocaleString('vi-VN')}đ) ` +
        `đã bị quản trị viên kết thúc sớm` +
        (deal.flagged
          ? ' do nghi ngờ giá gốc bị đẩy lên trước khi giảm giá.'
          : '.'),
      link: '/promotions',
    });

    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Kết thúc khuyến mãi',
      targetLabel: product.name,
      detail: deal.flagged ? `Nghi ngờ giá ảo: ${deal.flagReason}` : undefined,
    });

    return { ok: true };
  }

  private adminShapeDeal(p: {
    _id: Types.ObjectId;
    name: string;
    slug?: string;
    images: { url: string }[];
    variants: { image?: string }[];
    shop: { _id: Types.ObjectId; name: string };
    priceMin: number;
    priceMax: number;
    totalStock: number;
    status: string;
    activeDeal?: {
      price: number;
      startsAt?: Date;
      endsAt: Date;
      flagged?: boolean;
      flagReason?: string;
    };
  }) {
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
      image: p.images?.[0]?.url ?? p.variants?.find((v) => v.image)?.image,
      shop: { id: String(p.shop._id), name: p.shop.name },
      priceMin: p.priceMin,
      priceMax: p.priceMax,
      totalStock: p.totalStock,
      status: p.status,
      state,
      flagged: !!deal?.flagged,
      flagReason: deal?.flagReason,
      deal: deal
        ? {
            price: deal.price,
            startsAt: deal.startsAt,
            endsAt: deal.endsAt,
            discountPercent: this.discountPercentOf(p.priceMin, deal.price),
          }
        : undefined,
    };
  }

  /** Bọc chống chia-cho-0/NaN/Infinity khi `priceMin` bằng 0 hoặc âm (dữ liệu hỏng). */
  private discountPercentOf(priceMin: number, dealPrice: number): number {
    if (!priceMin || priceMin <= 0) return 0;
    return Math.round(((priceMin - dealPrice) / priceMin) * 100);
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
      image: p.images?.[0]?.url ?? p.variants?.find((v) => v.image)?.image,
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
            discountPercent: this.discountPercentOf(p.priceMin, deal.price),
          }
        : undefined,
    };
  }
}
