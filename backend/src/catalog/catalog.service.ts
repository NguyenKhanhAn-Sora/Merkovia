import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { Model, PipelineStage, Types } from 'mongoose';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import {
  Category,
  CategoryDocument,
} from '../categories/schemas/category.schema';
import { BrowseProductsDto } from './dto/browse-products.dto';
import { isDealLive } from '../products/deal';
import { buildSearchText } from '../common/text';
import { SemanticSearchService } from '../search/semantic-search.service';
import { ViewCounterService } from './view-counter.service';
import { readAccessToken, scopeFromRequest } from '../common/auth-scope';

/** Sắp xếp cho người mua → điều kiện sort của Mongo. */
const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { publishedAt: -1, createdAt: -1 },
  price_asc: { priceMin: 1 },
  price_desc: { priceMin: -1 },
  popular: { 'stats.sold': -1 },
  rating: { 'stats.ratingAvg': -1, 'stats.ratingCount': -1 },
};

/**
 * Dữ liệu công khai cho trang người mua.
 *
 * Mọi truy vấn ở đây đều phải qua ba lớp lọc, thiếu một lớp là lộ hàng không
 * được phép bán:
 *  1. Sản phẩm: `status: active`, chưa xoá, không bị kiểm duyệt từ chối.
 *  2. Gian hàng: đang `active` và KHÔNG ở chế độ tạm nghỉ.
 *  3. Biến thể: bỏ tổ hợp đã tắt (nếu không người mua chọn được hàng không có).
 */
@Injectable()
export class CatalogService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    private readonly semantic: SemanticSearchService,
    private readonly viewCounter: ViewCounterService,
    private readonly jwt: JwtService,
  ) {}

  /** Điều kiện lọc sản phẩm được phép hiển thị công khai. */
  private get visibleProductMatch() {
    return {
      status: 'active',
      deletedAt: null,
      'moderation.state': { $ne: 'rejected' },
    } as const;
  }

  /**
   * Khuyến mãi chỉ hợp lệ khi CHƯA hết hạn. `activeDeal` là ảnh chụp do
   * Promotion ghi xuống nên có thể còn sót lại sau khi hết giờ — phải tự lọc,
   * nếu không người mua thấy giá sale mà lúc đặt lại tính giá gốc.
   */
  private publicDeal(deal?: { price: number; startsAt?: Date; endsAt: Date }) {
    // Chưa tới giờ hoặc đã hết giờ đều coi như không có khuyến mãi.
    if (!isDealLive(deal)) return undefined;
    return { price: deal!.price, endsAt: deal!.endsAt };
  }

  /** Chỉ giữ biến thể đang bán — người mua không được thấy tổ hợp đã tắt. */
  private publicVariants(variants: ProductDocument['variants']) {
    return (variants ?? [])
      .filter((v) => v.isActive !== false)
      .map((v) => ({
        id: String(v._id),
        optionValues: v.optionValues,
        price: v.price,
        stock: v.stock,
        image: v.image,
      }));
  }

  /* ------------------------------ Danh sách ------------------------------ */

  async browse(query: BrowseProductsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const match: Record<string, unknown> = { ...this.visibleProductMatch };

    // Danh mục: nhận slug hoặc id, lọc cả nhánh con qua categoryPath.
    if (query.category) {
      const category = Types.ObjectId.isValid(query.category)
        ? await this.categoryModel.findById(query.category).select('_id')
        : await this.categoryModel
            .findOne({ slug: query.category })
            .select('_id');
      if (!category) {
        return { items: [], total: 0, page, limit };
      }
      match.categoryPath = category._id;
    }

    if (query.shop) {
      const shop = await this.shopModel
        .findOne({ slug: query.shop })
        .select('_id');
      if (!shop) return { items: [], total: 0, page, limit };
      match.shop = shop._id;
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      match.priceMin = {
        ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
      };
    }

    // Thứ tự theo độ liên quan ngữ nghĩa (chỉ dùng khi tìm kiếm bằng vector).
    let relevanceIds: Types.ObjectId[] | null = null;
    if (query.q?.trim()) {
      // Ưu tiên tìm kiếm NGỮ NGHĨA; `null` = tắt/lỗi, `[]` = không món nào hợp.
      const ranked = await this.semantic.rankIds(query.q).catch(() => null);
      // Khớp TỪ KHOÁ: bỏ dấu rồi so trên searchText (cũng đã bỏ dấu), AND các từ.
      const words = buildSearchText([query.q]).split(' ').filter(Boolean);
      const keywordAnd = words.length
        ? words.map((w) => ({
            searchText: { $regex: w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') },
          }))
        : null;

      if (ranked && ranked.length) {
        relevanceIds = ranked;
        // 🔴 HỢP tập ngữ nghĩa VỚI khớp từ khoá: hàng CHƯA có embedding (Gemini
        // lỗi/quota, vector sinh trễ) hay khớp đúng tên vẫn hiện — không "biến
        // mất" khỏi tìm kiếm. Vẫn lọc được ngành lạc đề vì truy vấn mô tả hiếm
        // khi khớp ĐỦ mọi từ khoá nên không kéo rác về.
        match.$or = [
          { _id: { $in: ranked } },
          ...(keywordAnd ? [{ $and: keywordAnd }] : []),
        ];
      } else if (keywordAnd) {
        // Ngữ nghĩa tắt / không ra kết quả → thuần từ khoá như cũ.
        match.$and = keywordAnd;
      }
    }

    // Khi tìm bằng ngữ nghĩa mà người dùng chưa chọn cách sắp xếp riêng, xếp theo
    // ĐỘ LIÊN QUAN (vị trí trong danh sách đã xếp hạng). Chọn giá/đánh giá... thì
    // tôn trọng lựa chọn đó, chỉ giới hạn trong tập ứng viên liên quan.
    const byRelevance =
      relevanceIds !== null &&
      (query.sort === undefined || query.sort === 'newest');

    const pipeline: PipelineStage[] = [
      { $match: match },
      ...(byRelevance
        ? [
            {
              $addFields: {
                // Vị trí trong danh sách xếp hạng ngữ nghĩa; -1 = chỉ khớp từ
                // khoá (ngoài tập ngữ nghĩa) → đẩy xuống CUỐI, không cho nhảy lên
                // đầu vì `indexOfArray` trả -1.
                _rel: {
                  $let: {
                    vars: { i: { $indexOfArray: [relevanceIds, '$_id'] } },
                    in: { $cond: [{ $lt: ['$$i', 0] }, 1_000_000, '$$i'] },
                  },
                },
              },
            } as PipelineStage,
          ]
        : []),
      // Nối sang shop để loại hàng của gian hàng bị đình chỉ / đang tạm nghỉ.
      {
        $lookup: {
          from: 'shops',
          localField: 'shop',
          foreignField: '_id',
          as: 'shopDoc',
        },
      },
      { $unwind: '$shopDoc' },
      {
        $match: {
          'shopDoc.status': 'active',
          'shopDoc.vacationMode': { $ne: true },
        },
      },
      // `_rel` càng nhỏ càng liên quan; đuôi chỉ-khớp-từ-khoá (cùng _rel) xếp
      // theo mới nhất.
      {
        $sort: byRelevance
          ? { _rel: 1, publishedAt: -1, createdAt: -1 }
          : SORTS[query.sort ?? 'newest'],
      },
      {
        $facet: {
          items: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                name: 1,
                slug: 1,
                images: { $slice: ['$images', 1] },
                priceMin: 1,
                priceMax: 1,
                totalStock: 1,
                activeDeal: 1,
                stats: 1,
                'shopDoc.name': 1,
                'shopDoc.slug': 1,
                'shopDoc.logoUrl': 1,
              },
            },
          ],
          total: [{ $count: 'value' }],
        },
      },
    ];

    const [result] = await this.productModel.aggregate(pipeline);
    const rows = (result?.items ?? []) as Record<string, any>[];

    return {
      items: rows.map((p) => ({
        id: String(p._id),
        slug: p.slug,
        name: p.name,
        image: p.images?.[0]?.url,
        priceMin: p.priceMin,
        priceMax: p.priceMax,
        deal: this.publicDeal(p.activeDeal),
        inStock: (p.totalStock ?? 0) > 0,
        sold: p.stats?.sold ?? 0,
        ratingAvg: p.stats?.ratingAvg ?? 0,
        ratingCount: p.stats?.ratingCount ?? 0,
        shop: {
          name: p.shopDoc?.name,
          slug: p.shopDoc?.slug,
          logoUrl: p.shopDoc?.logoUrl,
        },
      })),
      total: (result?.total?.[0]?.value as number) ?? 0,
      page,
      limit,
    };
  }

  /* ------------------------------ Chi tiết ------------------------------- */

  async productBySlug(slug: string, req?: Request) {
    const product = await this.productModel
      .findOne({ slug, ...this.visibleProductMatch })
      .populate([
        { path: 'category', select: 'name slug' },
        { path: 'categoryPath', select: 'name slug' },
      ]);
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm.');

    const shop = await this.shopModel.findById(product.shop);
    // Gian hàng nghỉ/bị đình chỉ → coi như sản phẩm không tồn tại với người mua.
    if (!shop || shop.status !== 'active' || shop.vacationMode) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }

    this.countView(product, shop, req);

    return {
      product: {
        id: String(product._id),
        slug: product.slug,
        name: product.name,
        description: product.description,
        images: product.images,
        optionTiers: product.optionTiers,
        variants: this.publicVariants(product.variants),
        priceMin: product.priceMin,
        priceMax: product.priceMax,
        deal: this.publicDeal(product.activeDeal),
        inStock: product.totalStock > 0,
        attributes: product.attributes,
        shipping: product.shipping,
        stats: {
          sold: product.stats?.sold ?? 0,
          views: product.stats?.views ?? 0,
          ratingAvg: product.stats?.ratingAvg ?? 0,
          ratingCount: product.stats?.ratingCount ?? 0,
          // Phân bố sao để vẽ thanh tổng quan — đọc sẵn từ đây, khỏi phải
          // aggregate lại toàn bộ đánh giá mỗi lần mở trang sản phẩm.
          ratingBreakdown: product.stats?.ratingBreakdown ?? [0, 0, 0, 0, 0],
        },
        category: product.category,
        categoryPath: product.categoryPath,
        shop: this.publicShop(shop),
      },
    };
  }

  /**
   * Đếm lượt xem CÓ RÀNG BUỘC (chống buff view ảo), fail-safe:
   *  - Bỏ qua request từ app Người Bán (xem/xem trước hàng không phải lượt mua).
   *  - Không tính khi CHÍNH CHỦ shop tự xem hàng của mình.
   *  - Mỗi người xem (tài khoản hoặc IP) chỉ +1 trong cửa sổ `dedupSeconds`.
   */
  private countView(
    product: ProductDocument,
    shop: ShopDocument,
    req?: Request,
  ) {
    if (!req) return;
    if (scopeFromRequest(req) === 'seller') return;

    const viewer = this.resolveViewer(req);
    // Chủ shop tự xem → không tính (chặn tự buff bằng chính tài khoản mình).
    if (viewer.userId && String(shop.owner) === viewer.userId) return;

    const viewerKey = viewer.userId ? `u:${viewer.userId}` : `ip:${viewer.ip}`;
    if (!this.viewCounter.shouldCount(String(product._id), viewerKey)) return;

    // Không chặn phản hồi, hỏng cũng không ảnh hưởng người dùng.
    void this.productModel
      .updateOne({ _id: product._id }, { $inc: { 'stats.views': 1 } })
      .catch(() => undefined);
  }

  /** Định danh người xem: tài khoản (nếu có phiên hợp lệ) hoặc IP. */
  private resolveViewer(req: Request): { userId?: string; ip: string } {
    const ip = req.ip ?? 'unknown';
    const token = readAccessToken(req);
    if (token) {
      try {
        const payload = this.jwt.verify<{ sub: string }>(token);
        if (payload?.sub) return { userId: payload.sub, ip };
      } catch {
        // Token hỏng/hết hạn → coi như khách, đếm theo IP.
      }
    }
    return { ip };
  }

  /* ------------------------------ Gian hàng ------------------------------ */

  private publicShop(shop: ShopDocument) {
    return {
      // Id cần cho nút "Nhắn tin" (mở hội thoại theo gian hàng). Không nhạy
      // cảm: đây là gian hàng công khai, ai xem trang cũng thấy được.
      id: String(shop._id),
      name: shop.name,
      slug: shop.slug,
      logoUrl: shop.logoUrl,
      description: shop.description,
      category: shop.category,
      preparationDays: shop.preparationDays,
      returnPolicy: shop.returnPolicy,
      // Chỉ tỉnh/thành — không lộ địa chỉ chi tiết kho của người bán.
      province: shop.pickupAddress?.province,
      createdAt: (shop as unknown as { createdAt?: Date }).createdAt,
    };
  }

  async shopBySlug(slug: string) {
    const shop = await this.shopModel.findOne({ slug });
    if (!shop || shop.status !== 'active') {
      throw new NotFoundException('Không tìm thấy gian hàng.');
    }

    const productCount = await this.productModel.countDocuments({
      shop: shop._id,
      ...this.visibleProductMatch,
    });

    return {
      shop: {
        ...this.publicShop(shop),
        productCount,
        vacationMode: shop.vacationMode,
      },
    };
  }

  /** Cây danh mục kèm số sản phẩm đang bán — cho dải danh mục ở trang chủ. */
  async categoriesWithCounts() {
    const roots = await this.categoryModel
      .find({ isActive: true, level: 0 })
      .sort({ order: 1 })
      .lean();

    const counts = await this.productModel.aggregate<{
      _id: Types.ObjectId;
      n: number;
    }>([
      { $match: this.visibleProductMatch },
      { $unwind: '$categoryPath' },
      { $group: { _id: '$categoryPath', n: { $sum: 1 } } },
    ]);
    const byId = new Map(counts.map((c) => [String(c._id), c.n]));

    return roots.map((r) => ({
      id: String(r._id),
      name: r.name,
      slug: r.slug,
      icon: r.icon,
      productCount: byId.get(String(r._id)) ?? 0,
    }));
  }
}
