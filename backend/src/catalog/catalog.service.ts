import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { BrowseProductsDto } from './dto/browse-products.dto';
import { buildSearchText } from '../common/text';

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
  private publicDeal(deal?: { price: number; endsAt: Date }) {
    if (!deal || new Date(deal.endsAt).getTime() <= Date.now()) return undefined;
    return { price: deal.price, endsAt: deal.endsAt };
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
        : await this.categoryModel.findOne({ slug: query.category }).select('_id');
      if (!category) {
        return { items: [], total: 0, page, limit };
      }
      match.categoryPath = category._id;
    }

    if (query.shop) {
      const shop = await this.shopModel.findOne({ slug: query.shop }).select('_id');
      if (!shop) return { items: [], total: 0, page, limit };
      match.shop = shop._id;
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      match.priceMin = {
        ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
      };
    }

    if (query.q?.trim()) {
      // Bỏ dấu từ khoá rồi khớp trên searchText (cũng đã bỏ dấu).
      const words = buildSearchText([query.q]).split(' ').filter(Boolean);
      if (words.length) {
        match.$and = words.map((w) => ({
          searchText: { $regex: w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') },
        }));
      }
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
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
      { $match: { 'shopDoc.status': 'active', 'shopDoc.vacationMode': { $ne: true } } },
      { $sort: SORTS[query.sort ?? 'newest'] },
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

  async productBySlug(slug: string) {
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

    // Đếm lượt xem: không chặn phản hồi, hỏng cũng không ảnh hưởng người dùng.
    void this.productModel
      .updateOne({ _id: product._id }, { $inc: { 'stats.views': 1 } })
      .catch(() => undefined);

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

  /* ------------------------------ Gian hàng ------------------------------ */

  private publicShop(shop: ShopDocument) {
    return {
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
      shop: { ...this.publicShop(shop), productCount, vacationMode: shop.vacationMode },
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
