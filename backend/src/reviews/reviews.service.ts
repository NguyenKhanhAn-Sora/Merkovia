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
  CreateReviewDto,
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
import type { UserDocument } from '../users/schemas/user.schema';
import { config } from '../config/config';

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
        { $match: { shop: shop._id } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
      ]),
    ]);

    // Phân bố sao của CẢ gian hàng: gộp từ đánh giá thật, không đọc từ
    // `Product.stats` (mỗi shop có nhiều sản phẩm, cộng trung bình của trung
    // bình sẽ ra số sai).
    const breakdown = [0, 0, 0, 0, 0];
    let sum = 0;
    for (const g of grouped) {
      if (g._id >= 1 && g._id <= 5) breakdown[g._id - 1] = g.count;
      sum += g._id * g.count;
    }

    return {
      items: await this.publicReviews(items, { forShop: true }),
      total,
      page,
      limit: PAGE_SIZE,
      counts: { all, unanswered, low },
      summary: {
        ratingAvg: all > 0 ? Math.round((sum / all) * 10) / 10 : 0,
        ratingCount: all,
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
      reply: r.reply,
      // Tên + logo shop để phần phản hồi có mặt người bán, không chỉ trơ chữ.
      ...(r.reply
        ? { replyBy: { name: shop?.name, logoUrl: shop?.logoUrl } }
        : {}),
      repliedAt: r.repliedAt,
      replyEdited: !!r.replyEditedAt,
      edited: r.edited,
      createdAt: (r as unknown as { createdAt: Date }).createdAt,
      // Người bán cần biết đánh giá thuộc sản phẩm nào để mở đúng trang.
      ...(opts.forShop ? { productId: String(r.product) } : {}),
    };
  }
}

/** Mảng 5 phần tử để cộng/trừ đúng một ô phân bố sao. */
function deltaFor(rating: number, sign: 1 | -1): number[] {
  const delta = [0, 0, 0, 0, 0];
  delta[rating - 1] = sign;
  return delta;
}
