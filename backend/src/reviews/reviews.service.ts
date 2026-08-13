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
import { Review, ReviewDocument } from './schemas/review.schema';
import {
  AdminListReviewsDto,
  CreateReviewDto,
  HideReviewContentDto,
  ListReviewsDto,
  ListShopReviewsDto,
  ReplyReviewDto,
  UpdateReviewDto,
} from './dto/review.dto';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Profile, ProfileDocument } from '../profiles/schemas/profile.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import type { UserDocument } from '../users/schemas/user.schema';
import { config } from '../config/config';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PAGE_SIZE = 10;

/**
 * Che bớt tên người đánh giá ẩn danh: "Nguyễn Khánh Ân" → "Ngu*** Ân".
 * Giữ lại chữ đầu và chữ cuối để người đọc vẫn thấy đây là người thật, chứ
 * không phải một dòng vô danh máy sinh ra.
 */
function maskName(name?: string): string {
  const clean = (name ?? '').trim();
  if (!clean) return 'Người mua ẩn danh';

  const parts = clean.split(/\s+/);
  const head = parts[0];
  const masked = head.length <= 2 ? `${head}***` : `${head.slice(0, 3)}***`;
  return parts.length > 1 ? `${masked} ${parts[parts.length - 1]}` : masked;
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
    @InjectModel(Shop.name)
    private readonly shopModel: Model<ShopDocument>,
    private readonly notifications: NotificationsService,
    private readonly auditLog: AuditLogService,
  ) {}

  /* ------------------------------ Người mua ------------------------------ */

  /**
   * Viết đánh giá cho một dòng hàng trong đơn đã giao.
   *
   * 🔴 Ba lớp chặn, và cả ba đều cần:
   *  1. Đơn phải của CHÍNH người đang đăng nhập.
   *  2. Đơn phải ở trạng thái `delivered` — chưa nhận hàng thì chưa có gì để nói.
   *  3. Khoá duy nhất `{order, variant}` chặn hai lần bấm gửi song song. Kiểm
   *     trước rồi ghi sau luôn có khe hở giữa hai bước, và hậu quả không chỉ là
   *     hai đánh giá trùng mà là `ratingCount` bị cộng hai lần.
   */
  async create(user: UserDocument, dto: CreateReviewDto) {
    const order = await this.orderModel.findOne({
      _id: dto.orderId,
      buyer: user._id,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');

    if (order.status !== 'delivered') {
      throw new BadRequestException(
        'Chỉ đánh giá được sau khi đơn hàng giao thành công.',
      );
    }

    const item = order.items.find((i) => String(i.variant) === dto.variantId);
    if (!item) {
      throw new NotFoundException('Sản phẩm này không có trong đơn hàng.');
    }

    const media = (dto.media ?? []).map((m) => ({
      kind: m.kind as 'image' | 'video',
      url: m.url.trim(),
      key: m.key?.trim(),
    }));

    let review: ReviewDocument;
    try {
      review = await this.reviewModel.create({
        buyer: user._id,
        product: item.product,
        shop: order.shop,
        order: order._id,
        variant: item.variant,
        variantLabel: item.variantLabel,
        rating: dto.rating,
        comment: dto.comment?.trim() ?? '',
        media,
        anonymous: !!dto.anonymous,
      });
    } catch (e: unknown) {
      if ((e as { code?: number })?.code === 11000) {
        throw new ConflictException('Bạn đã đánh giá sản phẩm này rồi.');
      }
      throw e;
    }

    // Điểm sao chỉ là con số hiển thị — hỏng ở đây không được làm mất đánh giá
    // vừa viết. Bản thân phép cộng lại tự chữa được ở lần đánh giá sau.
    await this.applyRatingDelta(item.product, deltaFor(dto.rating, +1));

    await this.notifications.notifyShop(order.shop, {
      type: 'review_received',
      title: 'Sản phẩm có đánh giá mới',
      body: `"${item.name}" vừa nhận đánh giá ${dto.rating}★.`,
      link: `/reviews`,
      data: { productId: String(item.product), rating: dto.rating },
    });

    return { review: await this.publicReview(review) };
  }

  /**
   * Đánh giá của chính mình cho một đơn — để giao diện biết dòng nào đã viết,
   * VÀ đủ dữ liệu để tự điền lại form khi sửa (rating/comment/media/anonymous).
   *
   * `canEdit`/`editableUntil` tính sẵn ở server theo `reviewEditWindowHours`
   * hiện hành — giao diện không tự suy ra hạn sửa để tránh lệch nếu sau này
   * đổi cấu hình mà quên đồng bộ hai nơi.
   */
  async myReviewsForOrder(user: UserDocument, orderId: string) {
    if (!Types.ObjectId.isValid(orderId)) return { reviews: [] };
    const reviews = await this.reviewModel
      // ObjectId chứ không phải chuỗi — xem chú thích ở `listForProduct`.
      .find({ order: new Types.ObjectId(orderId), buyer: user._id })
      .lean();
    return {
      reviews: reviews.map((r) => {
        const editableUntil = this.reviewEditDeadline(
          (r as unknown as { createdAt: Date }).createdAt,
        );
        return {
          id: String(r._id),
          variantId: String(r.variant),
          rating: r.rating,
          comment: r.comment,
          media: r.media.map((m) => ({ kind: m.kind, url: m.url, key: m.key })),
          anonymous: r.anonymous,
          edited: r.edited,
          editableUntil: editableUntil.toISOString(),
          canEdit: !r.edited && new Date() < editableUntil,
        };
      }),
    };
  }

  /**
   * Sửa đánh giá đã đăng — CHỈ MỘT LẦN, trong hạn `reviewEditWindowHours` kể từ
   * lúc đăng. Giới hạn kép (một lần + có hạn) vẫn cho chữa lỗi gõ/đổi ý sớm mà
   * không biến thành công cụ ép giá kiểu "1 sao doạ, đổi 5 sao sau khi được đền".
   */
  async update(user: UserDocument, reviewId: string, dto: UpdateReviewDto) {
    if (!Types.ObjectId.isValid(reviewId)) {
      throw new NotFoundException('Không tìm thấy đánh giá.');
    }
    const review = await this.reviewModel.findOne({
      _id: reviewId,
      buyer: user._id,
    });
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá.');

    if (review.edited) {
      throw new ForbiddenException('Đánh giá chỉ được sửa một lần.');
    }
    const deadline = this.reviewEditDeadline(
      (review as unknown as { createdAt: Date }).createdAt,
    );
    if (new Date() > deadline) {
      throw new ForbiddenException(
        `Đã quá hạn sửa đánh giá (${config.reviewEditWindowHours} giờ kể từ lúc đăng).`,
      );
    }

    const oldRating = review.rating;
    review.rating = dto.rating;
    review.comment = dto.comment?.trim() ?? '';
    review.media = (dto.media ?? []).map((m) => ({
      kind: m.kind as 'image' | 'video',
      url: m.url.trim(),
      key: m.key?.trim(),
    }));
    review.anonymous = !!dto.anonymous;
    review.edited = true;
    await review.save();

    // Điểm sao đổi thì bù trừ đúng ô cũ/mới — trừ trước cộng sau để không bao
    // giờ có khoảnh khắc tổng bị âm nếu hai request xen kẽ nhau.
    if (dto.rating !== oldRating) {
      await this.applyRatingDelta(review.product, deltaFor(oldRating, -1));
      await this.applyRatingDelta(review.product, deltaFor(dto.rating, +1));
    }

    return { review: await this.publicReview(review) };
  }

  private reviewEditDeadline(createdAt: Date): Date {
    return new Date(
      createdAt.getTime() + config.reviewEditWindowHours * 3_600_000,
    );
  }

  /** Như trên nhưng cho nhiều đơn — trang danh sách hỏi MỘT lượt. */
  async myReviewsForOrders(user: UserDocument, orderIds: string[]) {
    const ids = orderIds
      .filter((id) => Types.ObjectId.isValid(id))
      .slice(0, 50) // trang danh sách không bao giờ hiện quá chừng này
      .map((id) => new Types.ObjectId(id));
    if (ids.length === 0) return { reviewed: {} };

    const reviews = await this.reviewModel
      .find({ order: { $in: ids }, buyer: user._id })
      .select('order variant')
      .lean();

    const reviewed: Record<string, string[]> = {};
    for (const r of reviews) {
      (reviewed[String(r.order)] ??= []).push(String(r.variant));
    }
    return { reviewed };
  }

  /* ----------------------------- Công khai ------------------------------ */

  /** Danh sách đánh giá của một sản phẩm. */
  async listForProduct(productId: string, query: ListReviewsDto) {
    if (!Types.ObjectId.isValid(productId)) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }

    /**
     * 🔴 Ép sang ObjectId, KHÔNG để nguyên chuỗi. Mongoose ép kiểu chuỗi cho
     * `_id` nhưng không cho các đường dẫn tham chiếu như `product` — truyền
     * chuỗi thì truy vấn trả về RỖNG mà chẳng báo lỗi gì, nhìn hệt như "sản
     * phẩm chưa có đánh giá nào".
     */
    const filter: Record<string, unknown> = {
      product: new Types.ObjectId(productId),
      // Đánh giá bị admin ẩn không bao giờ lộ ra trang công khai.
      hidden: { $ne: true },
    };
    if (query.rating) filter.rating = query.rating;
    // `$ne: []` chứ không phải `$exists`: mảng rỗng vẫn tồn tại.
    if (query.hasMedia === 'true') filter.media = { $ne: [] };

    const page = Math.max(1, query.page ?? 1);
    const [items, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE),
      this.reviewModel.countDocuments(filter),
    ]);

    return {
      items: await this.publicReviews(items),
      total,
      page,
      limit: PAGE_SIZE,
    };
  }

  /* ----------------------------- Người bán ------------------------------ */

  async listForShop(user: UserDocument, query: ListShopReviewsDto) {
    const shop = await this.shopModel.findOne({ owner: user._id });
    if (!shop) throw new ForbiddenException('Tài khoản chưa có gian hàng.');

    const base: Record<string, unknown> = { shop: shop._id };
    const filter = { ...base };
    if (query.tab === 'unanswered') filter.reply = { $in: [null, ''] };
    if (query.tab === 'low') filter.rating = { $lte: 3 };
    if (query.rating) filter.rating = query.rating;

    const page = Math.max(1, query.page ?? 1);
    const [items, total, all, unanswered, low, grouped] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE),
      this.reviewModel.countDocuments(filter),
      this.reviewModel.countDocuments(base),
      this.reviewModel.countDocuments({ ...base, reply: { $in: [null, ''] } }),
      this.reviewModel.countDocuments({ ...base, rating: { $lte: 3 } }),
      this.reviewModel.aggregate<{ _id: number; count: number }>([
        // Đánh giá bị admin ẩn không được tính vào điểm sao hiển thị — con số
        // này phải khớp với những gì buyer thấy công khai, không phải toàn bộ
        // kho đánh giá seller có (kể cả hàng đã ẩn thì vẫn thấy trong `items`
        // để seller biết vì sao rớt điểm, nhưng không được TÍNH vào điểm nữa).
        { $match: { shop: shop._id, hidden: { $ne: true } } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
      ]),
    ]);

    // Phân bố sao của CẢ gian hàng: gộp từ đánh giá thật, không đọc từ
    // `Product.stats` (mỗi shop có nhiều sản phẩm, cộng trung bình của trung
    // bình sẽ ra số sai).
    const breakdown = [0, 0, 0, 0, 0];
    let sum = 0;
    let liveCount = 0;
    for (const g of grouped) {
      if (g._id >= 1 && g._id <= 5) breakdown[g._id - 1] = g.count;
      sum += g._id * g.count;
      liveCount += g.count;
    }

    return {
      items: await this.publicReviews(items, { forShop: true }),
      total,
      page,
      limit: PAGE_SIZE,
      // `all/unanswered/low` = tổng KHO đánh giá (kể cả đã ẩn) — số trên tab.
      counts: { all, unanswered, low },
      // Điểm sao chỉ tính từ đánh giá CÒN HIỂN THỊ — phải khớp với `liveCount`
      // của `grouped` (đã lọc `hidden`), không phải `all`, kẻo mẫu số sai.
      summary: {
        ratingAvg: liveCount > 0 ? Math.round((sum / liveCount) * 10) / 10 : 0,
        ratingCount: liveCount,
        breakdown,
      },
    };
  }

  /**
   * Người bán phản hồi một đánh giá — gọi lại được nhiều lần để SỬA phản hồi
   * đã gửi. `repliedAt` giữ nguyên mốc lần đầu; lần sửa ghi vào `replyEditedAt`
   * để giao diện hiện rõ "(đã chỉnh sửa)", không âm thầm đổi nội dung mà vẫn
   * hiện ngày trả lời ban đầu.
   */
  async reply(user: UserDocument, reviewId: string, dto: ReplyReviewDto) {
    const shop = await this.shopModel.findOne({ owner: user._id });
    if (!shop) throw new ForbiddenException('Tài khoản chưa có gian hàng.');

    if (!Types.ObjectId.isValid(reviewId)) {
      throw new NotFoundException('Không tìm thấy đánh giá.');
    }
    const review = await this.reviewModel.findOne({
      _id: reviewId,
      shop: shop._id,
    });
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá.');

    if (review.reply) {
      review.replyEditedAt = new Date();
    } else {
      review.repliedAt = new Date();
    }
    review.reply = dto.reply.trim();
    await review.save();

    return { review: await this.publicReview(review, { forShop: true }) };
  }

  /* ------------------------------- Admin --------------------------------- */

  /**
   * Danh sách đánh giá cho trang kiểm duyệt của admin — thấy CẢ đánh giá đã
   * ẩn (khác `listForProduct`/`listForShop`), kèm đủ ngữ cảnh (người mua,
   * sản phẩm, gian hàng, đơn hàng) để admin không phải mở nhiều tab mới xét
   * được một đánh giá.
   */
  async adminList(query: AdminListReviewsDto) {
    const filter: Record<string, unknown> = {};
    if (query.shopId && Types.ObjectId.isValid(query.shopId)) {
      filter.shop = new Types.ObjectId(query.shopId);
    }
    if (query.productId && Types.ObjectId.isValid(query.productId)) {
      filter.product = new Types.ObjectId(query.productId);
    }
    if (query.rating) filter.rating = query.rating;
    // "Đã ẩn" = review bị ẩn HOẶC reply bị ẩn — admin cần thấy cả hai loại
    // trong cùng hàng đợi kiểm duyệt, kẻo quên mất những review chỉ-ẩn-reply.
    if (query.hidden === 'hidden') {
      filter.$or = [{ hidden: true }, { replyHidden: true }];
    }
    if (query.hidden === 'visible') {
      filter.hidden = { $ne: true };
      filter.replyHidden = { $ne: true };
    }

    const term = query.q?.trim();
    if (term) filter.comment = { $regex: escapeRegex(term), $options: 'i' };

    const page = Math.max(1, query.page ?? 1);
    const [items, total, allCount, hiddenCount] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate<{
          buyer: { _id: Types.ObjectId; email?: string; phone?: string };
        }>('buyer', 'email phone')
        .lean(),
      this.reviewModel.countDocuments(filter),
      this.reviewModel.countDocuments({}),
      this.reviewModel.countDocuments({ $or: [{ hidden: true }, { replyHidden: true }] }),
    ]);

    return {
      items: await this.adminShape(items),
      total,
      page,
      limit: PAGE_SIZE,
      counts: { all: allCount, hidden: hiddenCount },
    };
  }

  /** Gắn tên người mua/sản phẩm/gian hàng/đơn hàng cho một loạt hàng chờ admin xét. */
  private async adminShape(
    reviews: (Omit<Review, 'buyer'> & {
      _id: Types.ObjectId;
      createdAt?: Date;
      buyer: { _id: Types.ObjectId; email?: string; phone?: string };
    })[],
  ) {
    if (reviews.length === 0) return [];

    const buyerIds = [...new Set(reviews.map((r) => String(r.buyer._id)))].map(
      (id) => new Types.ObjectId(id),
    );
    const productIds = [...new Set(reviews.map((r) => String(r.product)))].map(
      (id) => new Types.ObjectId(id),
    );
    const shopIds = [...new Set(reviews.map((r) => String(r.shop)))].map(
      (id) => new Types.ObjectId(id),
    );
    const orderIds = [...new Set(reviews.map((r) => String(r.order)))].map(
      (id) => new Types.ObjectId(id),
    );

    const [profiles, products, shops, orders] = await Promise.all([
      this.profileModel
        .find({ user: { $in: buyerIds } })
        .select('user fullName displayName')
        .lean(),
      this.productModel
        .find({ _id: { $in: productIds } })
        .select('name images')
        .lean(),
      this.shopModel.find({ _id: { $in: shopIds } }).select('name').lean(),
      this.orderModel
        .find({ _id: { $in: orderIds } })
        .select('orderCode')
        .lean(),
    ]);
    const byProfile = new Map(profiles.map((p) => [String(p.user), p]));
    const byProduct = new Map(products.map((p) => [String(p._id), p]));
    const byShop = new Map(shops.map((s) => [String(s._id), s]));
    const byOrder = new Map(orders.map((o) => [String(o._id), o]));

    return reviews.map((r) => {
      const profile = byProfile.get(String(r.buyer._id));
      const product = byProduct.get(String(r.product));
      const shop = byShop.get(String(r.shop));
      const order = byOrder.get(String(r.order));
      return {
        id: String(r._id),
        rating: r.rating,
        comment: r.comment,
        media: r.media.map((m) => ({ kind: m.kind, url: m.url })),
        variantLabel: r.variantLabel,
        anonymous: r.anonymous,
        buyer: {
          name: profile?.fullName || profile?.displayName || 'Người mua',
          contact: r.buyer.email || r.buyer.phone || '—',
        },
        product: {
          id: String(r.product),
          name: product?.name ?? '(sản phẩm đã bị gỡ)',
          image: product?.images?.[0]?.url,
        },
        shop: { id: String(r.shop), name: shop?.name ?? '(gian hàng đã gỡ)' },
        order: { id: String(r.order), orderCode: order?.orderCode ?? '—' },
        reply: r.reply,
        repliedAt: r.repliedAt,
        hidden: r.hidden,
        hiddenAt: r.hiddenAt,
        hiddenBy: r.hiddenBy,
        hiddenReason: r.hiddenReason,
        replyHidden: r.replyHidden,
        replyHiddenAt: r.replyHiddenAt,
        replyHiddenBy: r.replyHiddenBy,
        replyHiddenReason: r.replyHiddenReason,
        createdAt: r.createdAt,
      };
    });
  }

  /**
   * Ẩn toàn bộ đánh giá (rating + comment + media) khỏi trang sản phẩm — dùng
   * cho đánh giá spam/vi phạm chính sách. Trừ luôn điểm sao khỏi `Product.stats`
   * vì đánh giá không còn được tính là "còn hiển thị" nữa.
   */
  async adminHide(
    admin: AdminPrincipal,
    reviewId: string,
    dto: HideReviewContentDto,
  ) {
    const review = await this.findReviewOrThrow(reviewId);
    if (review.hidden) {
      throw new BadRequestException('Đánh giá này đã bị ẩn rồi.');
    }

    review.hidden = true;
    review.hiddenAt = new Date();
    review.hiddenBy = admin.email;
    review.hiddenReason = dto.reason.trim();
    await review.save();

    await this.applyRatingDelta(review.product, deltaFor(review.rating, -1));

    await this.notifications.notifyUser(review.buyer, 'buyer', {
      type: 'review_hidden',
      title: 'Đánh giá của bạn đã bị ẩn',
      body: `Đánh giá ${review.rating}★ của bạn đã bị quản trị viên ẩn khỏi trang sản phẩm. Lý do: ${review.hiddenReason}`,
      link: `/orders/${String(review.order)}`,
    });

    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Ẩn đánh giá',
      targetLabel: `Đánh giá ${review.rating}★`,
      detail: review.hiddenReason,
    });

    return { review: await this.adminShapeOne(review) };
  }

  /** Gỡ ẩn — cộng lại điểm sao theo rating HIỆN TẠI của đánh giá (có thể đã được buyer sửa trong lúc đang ẩn). */
  async adminUnhide(admin: AdminPrincipal, reviewId: string) {
    const review = await this.findReviewOrThrow(reviewId);
    if (!review.hidden) {
      throw new BadRequestException('Đánh giá này hiện không bị ẩn.');
    }

    review.hidden = false;
    review.hiddenAt = undefined;
    review.hiddenBy = undefined;
    review.hiddenReason = undefined;
    await review.save();

    await this.applyRatingDelta(review.product, deltaFor(review.rating, +1));

    await this.notifications.notifyUser(review.buyer, 'buyer', {
      type: 'review_unhidden',
      title: 'Đánh giá của bạn đã được khôi phục',
      body: `Đánh giá ${review.rating}★ của bạn đã hiển thị trở lại trên trang sản phẩm.`,
      link: `/orders/${String(review.order)}`,
    });

    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Gỡ ẩn đánh giá',
      targetLabel: `Đánh giá ${review.rating}★`,
    });

    return { review: await this.adminShapeOne(review) };
  }

  /**
   * Ẩn riêng phần PHẢN HỒI của shop — dùng khi chính phản hồi vi phạm (VD:
   * shop trả đũa buyer), không phạt oan đánh giá thật của buyer. Không tính
   * vào điểm sao (phản hồi chưa từng ảnh hưởng điểm).
   */
  async adminHideReply(
    admin: AdminPrincipal,
    reviewId: string,
    dto: HideReviewContentDto,
  ) {
    const review = await this.findReviewOrThrow(reviewId);
    if (!review.reply) {
      throw new BadRequestException('Đánh giá này chưa có phản hồi.');
    }
    if (review.replyHidden) {
      throw new BadRequestException('Phản hồi này đã bị ẩn rồi.');
    }

    review.replyHidden = true;
    review.replyHiddenAt = new Date();
    review.replyHiddenBy = admin.email;
    review.replyHiddenReason = dto.reason.trim();
    await review.save();

    await this.notifications.notifyShop(review.shop, {
      type: 'review_reply_hidden',
      title: 'Phản hồi đánh giá của bạn đã bị ẩn',
      body: `Phản hồi của bạn cho một đánh giá đã bị quản trị viên ẩn khỏi trang sản phẩm. Lý do: ${review.replyHiddenReason}`,
      link: '/reviews',
    });

    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Ẩn phản hồi đánh giá',
      targetLabel: `Đánh giá ${review.rating}★`,
      detail: review.replyHiddenReason,
    });

    return { review: await this.adminShapeOne(review) };
  }

  async adminUnhideReply(admin: AdminPrincipal, reviewId: string) {
    const review = await this.findReviewOrThrow(reviewId);
    if (!review.replyHidden) {
      throw new BadRequestException('Phản hồi này hiện không bị ẩn.');
    }

    review.replyHidden = false;
    review.replyHiddenAt = undefined;
    review.replyHiddenBy = undefined;
    review.replyHiddenReason = undefined;
    await review.save();

    await this.notifications.notifyShop(review.shop, {
      type: 'review_reply_unhidden',
      title: 'Phản hồi đánh giá của bạn đã được khôi phục',
      body: `Phản hồi của bạn đã hiển thị trở lại trên trang sản phẩm.`,
      link: '/reviews',
    });

    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Gỡ ẩn phản hồi đánh giá',
      targetLabel: `Đánh giá ${review.rating}★`,
    });

    return { review: await this.adminShapeOne(review) };
  }

  private async findReviewOrThrow(reviewId: string): Promise<ReviewDocument> {
    if (!Types.ObjectId.isValid(reviewId)) {
      throw new NotFoundException('Không tìm thấy đánh giá.');
    }
    const review = await this.reviewModel.findById(reviewId);
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá.');
    return review;
  }

  /** Bọc một đánh giá vừa xử lý xong lại thành dạng admin-list để trả về cho client. */
  private async adminShapeOne(review: ReviewDocument) {
    const lean = await this.reviewModel
      .findById(review._id)
      .populate<{
        buyer: { _id: Types.ObjectId; email?: string; phone?: string };
      }>('buyer', 'email phone')
      .lean();
    if (!lean) return null;
    const [shaped] = await this.adminShape([lean]);
    return shaped;
  }

  /* ------------------------------ Nội bộ -------------------------------- */

  /**
   * Cộng/trừ phân bố sao rồi TÍNH LẠI số lượng và điểm trung bình từ chính nó.
   *
   * 🔴 Làm trong MỘT update dạng pipeline thay vì đọc-tính-ghi: hai người cùng
   * đánh giá một sản phẩm thì cách đọc-rồi-ghi sẽ có người ghi đè kết quả của
   * người kia, và điểm trung bình trôi dần khỏi sự thật mà không ai hay.
   *
   * Phân bố sao là nguồn sự thật DUY NHẤT; `ratingCount` và `ratingAvg` luôn
   * được suy ra từ nó nên không bao giờ lệch nhau, kể cả khi sửa hay xoá.
   */
  private async applyRatingDelta(productId: Types.ObjectId, delta: number[]) {
    try {
      await this.productModel.updateOne(
        { _id: productId },
        [
          {
            $set: {
              'stats.ratingBreakdown': {
                $map: {
                  input: { $range: [0, 5] },
                  as: 'i',
                  in: {
                    // Không bao giờ xuống dưới 0: dữ liệu cũ có thể thiếu ô,
                    // và một lần trừ hụt sẽ làm hỏng vĩnh viễn con số.
                    $max: [
                      0,
                      {
                        $add: [
                          {
                            $ifNull: [
                              {
                                $arrayElemAt: [
                                  { $ifNull: ['$stats.ratingBreakdown', []] },
                                  '$$i',
                                ],
                              },
                              0,
                            ],
                          },
                          { $arrayElemAt: [delta, '$$i'] },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
          {
            $set: {
              'stats.ratingCount': { $sum: '$stats.ratingBreakdown' },
              'stats.ratingAvg': {
                $let: {
                  vars: {
                    count: { $sum: '$stats.ratingBreakdown' },
                    weighted: {
                      $sum: {
                        $map: {
                          input: { $range: [0, 5] },
                          as: 'i',
                          in: {
                            $multiply: [
                              {
                                $arrayElemAt: ['$stats.ratingBreakdown', '$$i'],
                              },
                              { $add: ['$$i', 1] },
                            ],
                          },
                        },
                      },
                    },
                  },
                  in: {
                    $cond: [
                      { $gt: ['$$count', 0] },
                      {
                        $round: [{ $divide: ['$$weighted', '$$count'] }, 1],
                      },
                      0,
                    ],
                  },
                },
              },
            },
          },
        ],
        // 🔴 Mongoose từ chối mảng làm nội dung cập nhật nếu thiếu cờ này —
        // nó không đoán được ta muốn dùng pipeline hay vô tình truyền nhầm.
        { updatePipeline: true },
      );
    } catch (err: unknown) {
      this.logger.warn(`Không cập nhật được điểm sao: ${String(err)}`);
    }
  }

  /** Gắn thông tin người viết cho một loạt đánh giá — hỏi hồ sơ MỘT lượt. */
  private async publicReviews(
    reviews: ReviewDocument[],
    opts: { forShop?: boolean } = {},
  ) {
    if (reviews.length === 0) return [];

    // Người ẩn danh vẫn phải lấy hồ sơ để che tên cho ra hồn, nhưng KHÔNG trả
    // ảnh đại diện — ảnh đại diện là thứ nhận ra người ta ngay lập tức.
    const buyerIds = [...new Set(reviews.map((r) => String(r.buyer)))].map(
      (id) => new Types.ObjectId(id),
    );
    const profiles = await this.profileModel
      .find({ user: { $in: buyerIds } })
      .select('user fullName displayName avatarUrl')
      .lean();
    const byUser = new Map(profiles.map((p) => [String(p.user), p]));

    // Tên + logo shop để hiển thị bên cạnh phản hồi. Chỉ hỏi cho các đánh giá
    // ĐÃ có phản hồi — không có phản hồi thì không cần tới shop nào.
    const shopIds = [
      ...new Set(
        reviews.filter((r) => r.reply).map((r) => String(r.shop)),
      ),
    ].map((id) => new Types.ObjectId(id));
    const shops = shopIds.length
      ? await this.shopModel
          .find({ _id: { $in: shopIds } })
          .select('name logoUrl')
          .lean()
      : [];
    const byShop = new Map(shops.map((s) => [String(s._id), s]));

    return reviews.map((r) =>
      this.shape(r, byUser.get(String(r.buyer)), opts, byShop.get(String(r.shop))),
    );
  }

  private async publicReview(
    review: ReviewDocument,
    opts: { forShop?: boolean } = {},
  ) {
    const [shaped] = await this.publicReviews([review], opts);
    return shaped;
  }

  private shape(
    r: ReviewDocument,
    profile?: { fullName?: string; displayName?: string; avatarUrl?: string },
    opts: { forShop?: boolean } = {},
    shop?: { name?: string; logoUrl?: string },
  ) {
    const realName = profile?.fullName || profile?.displayName || '';
    // Phản hồi bị admin ẩn (vì chính phản hồi vi phạm) không lộ ra công khai,
    // nhưng seller vẫn thấy phản hồi CỦA CHÍNH MÌNH để biết đã viết gì.
    const showReply = !!r.reply && (opts.forShop || !r.replyHidden);
    return {
      id: String(r._id),
      rating: r.rating,
      comment: r.comment,
      media: r.media.map((m) => ({ kind: m.kind, url: m.url })),
      variantLabel: r.variantLabel,
      anonymous: r.anonymous,
      author: {
        name: r.anonymous ? maskName(realName) : realName || 'Người mua',
        avatarUrl: r.anonymous ? undefined : profile?.avatarUrl,
      },
      reply: showReply ? r.reply : undefined,
      // Tên + logo shop để phần phản hồi có mặt người bán, không chỉ trơ chữ.
      ...(showReply
        ? { replyBy: { name: shop?.name, logoUrl: shop?.logoUrl } }
        : {}),
      repliedAt: showReply ? r.repliedAt : undefined,
      replyEdited: showReply ? !!r.replyEditedAt : false,
      edited: r.edited,
      createdAt: (r as unknown as { createdAt: Date }).createdAt,
      // Người bán cần biết đánh giá thuộc sản phẩm nào để mở đúng trang, và
      // trạng thái kiểm duyệt để hiểu vì sao một đánh giá/phản hồi biến mất.
      ...(opts.forShop
        ? {
            productId: String(r.product),
            hidden: r.hidden,
            hiddenReason: r.hiddenReason,
            replyHidden: r.replyHidden,
            replyHiddenReason: r.replyHiddenReason,
          }
        : {}),
    };
  }
}

/** Mảng 5 phần tử để cộng/trừ đúng một ô phân bố sao. */
function deltaFor(rating: number, sign: 1 | -1): number[] {
  const delta = [0, 0, 0, 0, 0];
  delta[rating - 1] = sign;
  return delta;
}
