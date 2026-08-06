import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Favorite, FavoriteDocument } from './schemas/favorite.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import type { UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class FavoritesService {
  private readonly logger = new Logger(FavoritesService.name);

  constructor(
    @InjectModel(Favorite.name)
    private readonly favoriteModel: Model<FavoriteDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  /**
   * Bật/tắt yêu thích một sản phẩm.
   *
   * Dùng `deleteOne`/`create` rồi đọc kết quả thay vì "kiểm tra rồi ghi": bấm
   * tim hai lần thật nhanh sẽ chạy song song, và unique index là thứ duy nhất
   * bảo đảm không tạo hai bản ghi rồi đếm lố `stats.favorites`.
   */
  async toggle(user: UserDocument, productId: string) {
    if (!Types.ObjectId.isValid(productId)) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }
    const product = await this.productModel
      .findOne({ _id: productId, deletedAt: null })
      .select('_id');
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm.');

    const removed = await this.favoriteModel.deleteOne({
      user: user._id,
      product: product._id,
    });

    if (removed.deletedCount === 1) {
      await this.bumpCount(product._id, -1);
      return { favorited: false };
    }

    try {
      await this.favoriteModel.create({ user: user._id, product: product._id });
      await this.bumpCount(product._id, 1);
    } catch (e: unknown) {
      // 11000 = đã có bản ghi (hai lần bấm song song) → coi như đã thích rồi,
      // KHÔNG cộng đếm lần nữa.
      if ((e as { code?: number })?.code !== 11000) throw e;
    }
    return { favorited: true };
  }

  /** Đếm hiển thị — hỏng cũng không được làm vỡ thao tác của người dùng. */
  private async bumpCount(productId: Types.ObjectId, delta: number) {
    await this.productModel
      .updateOne({ _id: productId }, { $inc: { 'stats.favorites': delta } })
      .catch((e: unknown) =>
        this.logger.warn(`Không cập nhật được lượt thích: ${String(e)}`),
      );
  }

  /** Các sản phẩm người dùng đã thích, kèm dữ liệu để vẽ thẻ sản phẩm. */
  async list(user: UserDocument, page = 1, limit = 24) {
    const filter = { user: user._id };
    const [rows, total] = await Promise.all([
      this.favoriteModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate<{ product: ProductDocument }>({
          path: 'product',
          select:
            'name slug images priceMin priceMax totalStock status deletedAt stats activeDeal shop',
          populate: { path: 'shop', select: 'name slug status vacationMode' },
        }),
      this.favoriteModel.countDocuments(filter),
    ]);

    const items = rows
      .map((row) => {
        const p = row.product;
        // Sản phẩm đã bị xoá hẳn → populate trả null. Bỏ khỏi danh sách chứ
        // không làm vỡ trang.
        if (!p) return null;
        const shop = p.shop as unknown as {
          name?: string;
          slug?: string;
          status?: string;
          vacationMode?: boolean;
        };
        const shopOpen = shop?.status === 'active' && !shop.vacationMode;
        return {
          id: String(p._id),
          slug: p.slug,
          name: p.name,
          image: p.images?.[0]?.url,
          priceMin: p.priceMin,
          priceMax: p.priceMax,
          inStock: (p.totalStock ?? 0) > 0,
          sold: p.stats?.sold ?? 0,
          ratingAvg: p.stats?.ratingAvg ?? 0,
          ratingCount: p.stats?.ratingCount ?? 0,
          shop: { name: shop?.name, slug: shop?.slug },
          /** Còn mua được không — hàng đã gỡ hoặc gian hàng tạm nghỉ/bị đình
           *  chỉ vẫn hiện nhưng mờ đi, khớp điều kiện chặn lúc đặt hàng. */
          available: p.status === 'active' && !p.deletedAt && shopOpen,
        };
      })
      .filter(Boolean);

    return { items, total, page, limit };
  }

  /** Các sản phẩm trong danh sách đang được thích — để tô tim ở trang duyệt. */
  async idsOf(user: UserDocument, productIds: string[]) {
    const valid = productIds.filter((id) => Types.ObjectId.isValid(id));
    if (valid.length === 0) return { favorited: [] };

    const rows = await this.favoriteModel
      .find({
        user: user._id,
        product: { $in: valid.map((id) => new Types.ObjectId(id)) },
      })
      .select('product');
    return { favorited: rows.map((r) => String(r.product)) };
  }
}
