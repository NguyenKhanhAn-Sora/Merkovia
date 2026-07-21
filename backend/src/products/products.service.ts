import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MediaService } from '../media/media.service';
import {
  Product,
  ProductDocument,
  ProductStatus,
} from './schemas/product.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { CategoriesService } from '../categories/categories.service';
import { CreateProductDto, VariantDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { buildSearchText, shortId, slugify } from '../common/text';
import type { UserDocument } from '../users/schemas/user.schema';

/**
 * Sản phẩm đã xoá được giữ lại bao lâu trước khi xoá vĩnh viễn.
 * Trong thời gian này người bán còn khôi phục được.
 */
export const TRASH_RETENTION_DAYS = 30;

/** Một dòng hàng cần giữ/hoàn kho (dùng khi tạo và huỷ đơn). */
export interface StockItem {
  productId: string;
  variantId: string;
  quantity: number;
}

/** Cách sắp xếp danh sách → điều kiện sort của Mongo. */
const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { priceMin: 1 },
  price_desc: { priceMin: -1 },
  sold: { 'stats.sold': -1 },
  stock: { totalStock: 1 },
};

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    private readonly categories: CategoriesService,
    private readonly media: MediaService,
  ) {}

  private readonly logger = new Logger(ProductsService.name);

  /** Gian hàng của người đang đăng nhập — mọi thao tác sản phẩm đều qua đây. */
  private async requireShop(user: UserDocument): Promise<ShopDocument> {
    const shop = await this.shopModel.findOne({ owner: user._id });
    if (!shop) {
      throw new ForbiddenException('Tài khoản chưa có gian hàng.');
    }
    if (shop.status === 'suspended') {
      throw new ForbiddenException(
        'Gian hàng đang bị tạm đình chỉ, không thể thao tác sản phẩm.',
      );
    }
    return shop;
  }

  /**
   * Kiểm tra bộ phân loại + biến thể khớp nhau.
   * Sai ở đây sẽ sinh SKU "mồ côi" mà giỏ hàng không map được → chặn từ đầu.
   */
  private validateVariants(
    tiers: { name: string; values: string[] }[] | undefined,
    variants: VariantDto[],
  ) {
    const tierList = tiers ?? [];

    if (tierList.length === 0) {
      // Không phân loại → đúng 1 biến thể, không mang optionValues.
      if (variants.length !== 1) {
        throw new BadRequestException(
          'Sản phẩm không có phân loại chỉ được có đúng một giá bán.',
        );
      }
      if (variants[0].optionValues?.length) {
        throw new BadRequestException(
          'Sản phẩm không có phân loại thì không được gắn giá trị phân loại.',
        );
      }
      return;
    }

    // Giá trị trong mỗi nhóm không được trùng nhau.
    for (const tier of tierList) {
      const uniq = new Set(tier.values.map((v) => v.trim().toLowerCase()));
      if (uniq.size !== tier.values.length) {
        throw new BadRequestException(
          `Nhóm "${tier.name}" có giá trị bị trùng.`,
        );
      }
    }

    const seen = new Set<string>();
    for (const v of variants) {
      if (v.optionValues.length !== tierList.length) {
        throw new BadRequestException(
          'Mỗi phân loại phải có đủ giá trị cho từng nhóm đã khai báo.',
        );
      }
      // Từng giá trị phải nằm trong danh sách của nhóm tương ứng.
      v.optionValues.forEach((val, i) => {
        if (!tierList[i].values.includes(val)) {
          throw new BadRequestException(
            `Giá trị "${val}" không thuộc nhóm "${tierList[i].name}".`,
          );
        }
      });
      // Không cho hai biến thể trùng tổ hợp.
      const key = JSON.stringify(v.optionValues);
      if (seen.has(key)) {
        throw new BadRequestException(
          `Tổ hợp phân loại "${v.optionValues.join(' / ')}" bị lặp lại.`,
        );
      }
      seen.add(key);
    }

    // Không bắt buộc đủ mọi tổ hợp (Đỏ có thể chỉ có size 60), nhưng phải còn
    // ít nhất một tổ hợp đang bán — nếu không sản phẩm chẳng mua được gì.
    if (!variants.some((v) => v.isActive !== false)) {
      throw new BadRequestException(
        'Cần ít nhất một phân loại đang được bán.',
      );
    }
  }

  /**
   * Ghép biến thể mới vào biến thể cũ, **GIỮ NGUYÊN `_id`** của những tổ hợp
   * còn tồn tại.
   *
   * Nếu gán đè cả mảng, Mongoose sinh `_id` mới cho MỌI biến thể sau mỗi lần
   * lưu — giỏ hàng và đơn hàng (tham chiếu tới variantId) sẽ đứt liên kết dù
   * người bán chỉ sửa mỗi cái tên. Đây là loại lỗi chỉ lộ ra khi đã có đơn thật.
   */
  private mergeVariants(
    current: ProductDocument['variants'],
    incoming: VariantDto[],
  ) {
    const byCombo = new Map(
      current.map((v) => [JSON.stringify(v.optionValues ?? []), v]),
    );
    return incoming.map((v) => {
      const prev = byCombo.get(JSON.stringify(v.optionValues ?? []));
      return {
        // Tổ hợp cũ → dùng lại _id; tổ hợp mới → để Mongoose tự sinh.
        ...(prev?._id ? { _id: prev._id } : {}),
        optionValues: v.optionValues,
        price: v.price,
        stock: v.stock,
        sku: v.sku,
        image: v.image,
        // Client gửi thì theo client; không gửi thì giữ nguyên trạng thái cũ.
        isActive: v.isActive ?? prev?.isActive ?? true,
      };
    });
  }

  /** Cập nhật các trường dẫn xuất từ variants (giá min/max, tổng kho). */
  private syncDerived(product: ProductDocument) {
    const active = product.variants.filter((v) => v.isActive !== false);
    const prices = active.map((v) => v.price);
    product.priceMin = prices.length ? Math.min(...prices) : 0;
    product.priceMax = prices.length ? Math.max(...prices) : 0;
    product.totalStock = active.reduce((sum, v) => sum + (v.stock ?? 0), 0);
  }

  /** Chuỗi tìm kiếm đã bỏ dấu, gom từ mọi phần chữ của sản phẩm. */
  private syncSearchText(product: ProductDocument, categoryName?: string) {
    product.searchText = buildSearchText([
      product.name,
      product.description,
      categoryName,
      ...product.attributes.flatMap((a) => [a.name, a.value]),
      ...product.optionTiers.flatMap((t) => t.values),
    ]);
  }

  /* ------------------------------- Tạo mới ------------------------------- */

  async create(user: UserDocument, dto: CreateProductDto) {
    const shop = await this.requireShop(user);

    const category = await this.categories.resolveForProduct(dto.categoryId);
    if (!category) {
      throw new BadRequestException('Danh mục không tồn tại hoặc đã ngừng dùng.');
    }
    this.validateVariants(dto.optionTiers, dto.variants);

    const product = new this.productModel({
      shop: shop._id,
      name: dto.name,
      // Kèm hậu tố ngẫu nhiên: tên sản phẩm hay trùng giữa các shop.
      slug: `${slugify(dto.name)}-${shortId()}`,
      description: dto.description?.trim(),
      category: category.id,
      categoryPath: category.path,
      optionTiers: dto.optionTiers ?? [],
      variants: dto.variants,
      images: dto.images,
      video: dto.video,
      attributes: dto.attributes ?? [],
      shipping: dto.shipping ?? {},
      status: dto.status ?? 'draft',
      publishedAt: dto.status === 'active' ? new Date() : undefined,
    });

    this.syncDerived(product);
    this.syncSearchText(product, category.name);
    await product.save();
    return { ok: true, id: String(product._id) };
  }

  /* ------------------------------ Danh sách ------------------------------ */

  async listMine(user: UserDocument, query: QueryProductsDto) {
    const shop = await this.requireShop(user);

    // Bỏ dấu từ khoá rồi so khớp trên searchText (cũng đã bỏ dấu).
    const words = query.q?.trim()
      ? buildSearchText([query.q]).split(' ').filter(Boolean)
      : [];

    // Tab "Đã xoá" xem thùng rác; các tab còn lại chỉ xem hàng đang dùng.
    const trash = query.status === 'deleted';

    // Dựng bất biến để TypeScript tự suy kiểu (mongoose 9 bỏ `FilterQuery`).
    const filter = {
      shop: shop._id,
      deletedAt: trash ? { $ne: null } : null,
      ...(query.status === 'out'
        ? { totalStock: 0 }
        : query.status && query.status !== 'all' && !trash
          ? { status: query.status as ProductStatus }
          : {}),
      ...(words.length
        ? {
            $and: words.map((w) => ({
              // Escape ký tự đặc biệt để từ khoá không phá vỡ regex.
              searchText: { $regex: w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') },
            })),
          }
        : {}),
    };

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort(SORTS[query.sort ?? 'newest'])
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.productModel.countDocuments(filter),
    ]);

    return {
      items: items.map((p) => ({
        id: String(p._id),
        name: p.name,
        image: p.images?.[0]?.url,
        priceMin: p.priceMin,
        priceMax: p.priceMax,
        totalStock: p.totalStock,
        sold: p.stats?.sold ?? 0,
        status: p.status,
        variantCount: p.variants?.length ?? 0,
        updatedAt: (p as { updatedAt?: Date }).updatedAt,
        // Có giá trị = đang ở thùng rác; client dùng để tính số ngày còn lại.
        deletedAt: p.deletedAt ?? undefined,
      })),
      total,
      page,
      limit,
      /** Số lượng theo từng tab để hiển thị badge. */
      counts: await this.countByStatus(shop._id as Types.ObjectId),
    };
  }

  private async countByStatus(shopId: Types.ObjectId) {
    const base = { shop: shopId, deletedAt: null };
    const [all, draft, active, hidden, out, deleted] = await Promise.all([
      this.productModel.countDocuments(base),
      this.productModel.countDocuments({ ...base, status: 'draft' }),
      this.productModel.countDocuments({ ...base, status: 'active' }),
      this.productModel.countDocuments({ ...base, status: 'hidden' }),
      this.productModel.countDocuments({ ...base, totalStock: 0 }),
      this.productModel.countDocuments({ shop: shopId, deletedAt: { $ne: null } }),
    ]);
    return { all, draft, active, hidden, out, deleted };
  }

  /* ------------------------------- Chi tiết ------------------------------ */

  /**
   * Luôn khoá theo shop của người gọi → không xem/sửa được hàng shop khác.
   * `includeDeleted` chỉ bật cho việc XEM và KHÔI PHỤC; sửa/xoá thì không,
   * vì sửa một sản phẩm đang nằm trong thùng rác là vô nghĩa.
   */
  private async findOwned(user: UserDocument, id: string, includeDeleted = false) {
    const shop = await this.requireShop(user);
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }
    const product = await this.productModel.findOne({
      _id: id,
      shop: shop._id,
      ...(includeDeleted ? {} : { deletedAt: null }),
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm.');
    return product;
  }

  /**
   * Chi tiết sản phẩm. Populate danh mục để client hiện được tên và đường dẫn
   * (Ngành hàng › Danh mục) mà không phải gọi thêm API.
   */
  async getMine(user: UserDocument, id: string) {
    // Cho xem cả sản phẩm trong thùng rác để người bán biết mình sắp khôi phục gì.
    const p = await this.findOwned(user, id, true);
    await p.populate([
      { path: 'category', select: 'name slug' },
      { path: 'categoryPath', select: 'name slug' },
    ]);
    return { product: p.toObject() };
  }

  /* ------------------------------ Cập nhật ------------------------------- */

  async update(user: UserDocument, id: string, dto: UpdateProductDto) {
    const product = await this.findOwned(user, id);

    let categoryName: string | undefined;
    if (dto.categoryId) {
      const category = await this.categories.resolveForProduct(dto.categoryId);
      if (!category) {
        throw new BadRequestException('Danh mục không tồn tại hoặc đã ngừng dùng.');
      }
      product.category = category.id;
      product.categoryPath = category.path;
      categoryName = category.name;
    }

    // optionTiers và variants phải được kiểm CÙNG NHAU, kể cả khi chỉ đổi một cái.
    if (dto.optionTiers !== undefined || dto.variants !== undefined) {
      const tiers = dto.optionTiers ?? product.optionTiers;
      const variants = (dto.variants ??
        product.variants) as unknown as VariantDto[];
      this.validateVariants(tiers, variants);
      if (dto.optionTiers !== undefined) product.optionTiers = dto.optionTiers;
      if (dto.variants !== undefined) {
        product.variants = this.mergeVariants(
          product.variants,
          dto.variants,
        ) as typeof product.variants;
      }
    }

    if (dto.name !== undefined) product.name = dto.name;
    if (dto.description !== undefined) {
      product.description = dto.description.trim() || undefined;
    }
    if (dto.images !== undefined) product.images = dto.images;
    if (dto.video !== undefined) product.video = dto.video;
    if (dto.attributes !== undefined) product.attributes = dto.attributes;
    if (dto.shipping !== undefined) {
      product.shipping = { ...product.shipping, ...dto.shipping };
    }
    if (dto.status !== undefined) {
      // Bị kiểm duyệt từ chối thì không được tự đăng bán lại.
      if (dto.status === 'active' && product.moderation?.state === 'rejected') {
        throw new BadRequestException(
          'Sản phẩm đang bị từ chối kiểm duyệt nên chưa thể đăng bán. Vui lòng chỉnh sửa theo phản hồi của quản trị viên.',
        );
      }
      if (dto.status === 'active' && !product.publishedAt) {
        product.publishedAt = new Date();
      }
      product.status = dto.status as typeof product.status;
    }

    this.syncDerived(product);
    this.syncSearchText(product, categoryName);
    await product.save();
    return { ok: true };
  }

  /* ----------------------- Giữ kho (cho đặt hàng) ------------------------- */

  /**
   * Trừ kho NGUYÊN TỬ cho một danh sách mặt hàng khi tạo đơn.
   *
   * Mấu chốt: mỗi mặt hàng chỉ dùng MỘT lệnh `updateOne` vừa kiểm tra vừa trừ.
   * Không có khe hở giữa lúc đọc và lúc ghi, nên hai người mua cùng lúc không
   * thể cùng lấy được món cuối cùng (đọc-rồi-ghi sẽ **bán vượt kho**).
   *
   * Điều kiện lọc đồng thời chặn luôn ca "người mua đặt đúng lúc người bán
   * xoá/ẩn hàng": sản phẩm phải còn `deletedAt: null`, `status: 'active'`,
   * biến thể phải đang bán và đủ số lượng. Không thoả → không trừ gì cả.
   *
   * Nếu một mặt hàng trong giỏ thất bại, phần đã trừ được HOÀN LẠI để không
   * giữ kho oan của người mua khác.
   */
  async reserveStock(items: StockItem[]): Promise<void> {
    const reserved: StockItem[] = [];

    for (const item of items) {
      if (item.quantity < 1) {
        throw new BadRequestException('Số lượng phải lớn hơn 0.');
      }
      const res = await this.productModel.updateOne(
        {
          _id: item.productId,
          deletedAt: null,
          status: 'active',
          variants: {
            $elemMatch: {
              _id: item.variantId,
              isActive: { $ne: false },
              stock: { $gte: item.quantity },
            },
          },
        },
        { $inc: { 'variants.$[v].stock': -item.quantity } },
        { arrayFilters: [{ 'v._id': item.variantId }] },
      );

      if (res.modifiedCount !== 1) {
        await this.releaseStock(reserved); // hoàn lại phần đã giữ
        throw new ConflictException(await this.explainReserveFailure(item));
      }
      reserved.push(item);
    }
  }

  /**
   * Dựng thông báo lỗi CỤ THỂ khi giữ kho thất bại.
   *
   * Chỉ chạy trên đường thất bại (hiếm) nên đọc thêm một lần là chấp nhận được,
   * đổi lại người mua biết đích xác món nào hỏng và vì sao — "đơn hàng thất
   * bại" chung chung thì họ không biết phải sửa gì trong giỏ.
   *
   * Kèm `detail` có cấu trúc để giao diện tô đúng dòng bị lỗi.
   */
  private async explainReserveFailure(item: StockItem) {
    const product = await this.productModel
      .findById(item.productId)
      .select('name variants status deletedAt');

    const detail = {
      productId: item.productId,
      variantId: item.variantId,
      name: product?.name,
    };

    const reject = (message: string, available?: number) => ({
      message,
      error: 'Conflict',
      statusCode: 409,
      reason: { ...detail, available },
    });

    if (!product || product.deletedAt || product.status !== 'active') {
      return reject(
        `"${product?.name ?? 'Sản phẩm'}" đã ngừng bán hoặc bị gỡ khỏi gian hàng.`,
      );
    }

    const variant = product.variants.find(
      (v) => String(v._id) === String(item.variantId),
    );
    if (!variant || variant.isActive === false) {
      return reject(`Phân loại bạn chọn của "${product.name}" đã ngừng bán.`);
    }

    // Còn hàng nhưng không đủ — nói rõ còn bao nhiêu để người mua giảm số lượng.
    return reject(
      variant.stock > 0
        ? `"${product.name}" chỉ còn ${variant.stock} sản phẩm, không đủ ${item.quantity} như bạn đặt.`
        : `"${product.name}" vừa hết hàng.`,
      variant.stock,
    );
  }

  /**
   * Hoàn kho khi huỷ đơn / hết hạn thanh toán / hoàn tiền.
   * KHÔNG lọc `deletedAt` — sản phẩm có thể đã bị người bán xoá sau khi đặt,
   * nhưng kho vẫn phải được trả về đúng.
   */
  async releaseStock(items: StockItem[]): Promise<void> {
    for (const item of items) {
      await this.productModel.updateOne(
        { _id: item.productId, 'variants._id': item.variantId },
        { $inc: { 'variants.$[v].stock': item.quantity } },
        { arrayFilters: [{ 'v._id': item.variantId }] },
      );
    }
  }

  /**
   * Cộng lượt bán khi đơn giao thành công.
   *
   * Cố tình KHÔNG cộng lúc đặt hàng: đơn còn có thể bị huỷ, và "đã bán" hiện
   * cho người mua nên là số giao thành công thật. Lỗi ở đây không được làm
   * hỏng việc chuyển trạng thái đơn nên chỉ ghi log.
   */
  async recordSold(items: StockItem[]): Promise<void> {
    for (const item of items) {
      await this.productModel
        .updateOne(
          { _id: item.productId },
          { $inc: { 'stats.sold': item.quantity } },
        )
        .catch((e: unknown) =>
          this.logger.warn(
            `Không cộng được lượt bán cho ${item.productId}: ${String(e)}`,
          ),
        );
    }
  }

  /* -------------------------------- Xoá ---------------------------------- */

  /**
   * Xoá MỀM: đơn hàng cũ vẫn tham chiếu tới sản phẩm này, xoá cứng sẽ làm
   * lịch sử mua hàng của người mua bị vỡ.
   */
  async remove(user: UserDocument, id: string) {
    const product = await this.findOwned(user, id);
    product.deletedAt = new Date();
    product.status = 'hidden';
    await product.save();
    return { ok: true };
  }

  /**
   * Khôi phục sản phẩm khỏi thùng rác.
   * Trả về trạng thái **nháp** chứ không tự đăng bán lại: sau vài tuần giá và
   * tồn kho có thể đã lỗi thời, để người bán chủ động kiểm rồi mới bật bán.
   */
  async restore(user: UserDocument, id: string) {
    const product = await this.findOwned(user, id, true);
    if (!product.deletedAt) {
      throw new BadRequestException('Sản phẩm này không nằm trong thùng rác.');
    }
    product.deletedAt = null;
    product.status = 'draft';
    await product.save();
    return { ok: true };
  }

  /**
   * Dọn thùng rác: xoá VĨNH VIỄN sản phẩm quá hạn giữ, kèm ảnh trên R2.
   *
   * Chạy bằng cron trong tiến trình — KHÔNG cần Redis. Redis/BullMQ chỉ đáng
   * dùng khi cần hàng đợi phân tán, retry, nhiều worker; quét dọn định kỳ thì
   * một câu truy vấn theo mốc thời gian là đủ và đơn giản hơn nhiều.
   */
  async purgeExpiredTrash(): Promise<{ purged: number }> {
    const cutoff = new Date(
      Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const expired = await this.productModel
      .find({ deletedAt: { $ne: null, $lt: cutoff } })
      .select('_id images video')
      .lean();

    if (expired.length === 0) return { purged: 0 };

    // Xoá ảnh trước để không bỏ lại file mồ côi trên R2 khi bản ghi biến mất.
    for (const p of expired) {
      const keys = [
        ...(p.images ?? []).map((i) => i.key),
        p.video?.key,
      ].filter((k): k is string => !!k);
      for (const key of keys) {
        try {
          await this.media.delete(key);
        } catch (err) {
          // Ảnh xoá hỏng không nên chặn việc dọn bản ghi.
          this.logger.warn(`Không xoá được ảnh R2 "${key}": ${String(err)}`);
        }
      }
    }

    const ids = expired.map((p) => p._id);
    await this.productModel.deleteMany({ _id: { $in: ids } });
    this.logger.log(
      `Đã xoá vĩnh viễn ${ids.length} sản phẩm quá ${TRASH_RETENTION_DAYS} ngày trong thùng rác.`,
    );
    return { purged: ids.length };
  }

  /** Chạy mỗi ngày lúc 3h sáng — giờ thấp điểm. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleTrashCleanup() {
    try {
      await this.purgeExpiredTrash();
    } catch (err) {
      this.logger.error('Dọn thùng rác thất bại', err as Error);
    }
  }
}
