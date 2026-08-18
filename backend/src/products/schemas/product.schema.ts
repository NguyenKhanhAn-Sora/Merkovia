import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

export const PRODUCT_STATUS = ['draft', 'active', 'hidden'] as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[number];

export const MODERATION_STATES = ['ok', 'pending', 'rejected'] as const;
export type ModerationState = (typeof MODERATION_STATES)[number];

/** Tối đa 2 nhóm phân loại (Màu × Size) — giữ số tổ hợp trong tầm kiểm soát. */
export const MAX_OPTION_TIERS = 2;

/* ------------------------------ Sub-documents ----------------------------- */

@Schema({ _id: false })
export class OptionTier {
  @Prop({ trim: true, required: true, maxlength: 30 })
  name: string; // vd "Màu sắc"

  @Prop({ type: [String], required: true })
  values: string[]; // vd ["Đỏ", "Xanh"]
}
const OptionTierSchema = SchemaFactory.createForClass(OptionTier);

/**
 * Một SKU bán được. Sản phẩm KHÔNG phân loại vẫn có đúng 1 variant với
 * `optionValues: []` — nhờ vậy giỏ hàng và đơn hàng chỉ có MỘT đường code,
 * không phải chia nhánh "có biến thể / không biến thể".
 */
@Schema({ _id: true })
export class ProductVariant {
  /**
   * Mongoose tự sinh (`_id: true`). Khai báo (KHÔNG kèm @Prop) để TypeScript
   * thấy được — giỏ hàng và đơn hàng sẽ tham chiếu tới id này.
   */
  _id?: Types.ObjectId;

  /** Mã seller tự đặt để đối soát kho — không bắt buộc. */
  @Prop({ trim: true, maxlength: 50 })
  sku?: string;

  /** Khớp THỨ TỰ với optionTiers, vd ["Đỏ", "M"]. Rỗng nếu không phân loại. */
  @Prop({ type: [String], default: [] })
  optionValues: string[];

  /** VND, số nguyên — tuyệt đối không dùng số thực cho tiền. */
  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, min: 0, default: 0 })
  stock: number;

  @Prop({ trim: true })
  image?: string;

  @Prop({ default: true })
  isActive: boolean;
}
const ProductVariantSchema = SchemaFactory.createForClass(ProductVariant);

@Schema({ _id: false })
export class ProductImage {
  @Prop({ required: true })
  url: string;

  /** Khoá trên R2 để xoá được file khi gỡ ảnh. */
  @Prop()
  key?: string;
}
const ProductImageSchema = SchemaFactory.createForClass(ProductImage);

/** Thuộc tính theo ngành hàng — chỗ MongoDB linh hoạt hơn hẳn SQL. */
@Schema({ _id: false })
export class ProductAttribute {
  @Prop({ trim: true, required: true, maxlength: 40 })
  name: string;

  @Prop({ trim: true, required: true, maxlength: 200 })
  value: string;
}
const ProductAttributeSchema = SchemaFactory.createForClass(ProductAttribute);

@Schema({ _id: false })
export class ProductShipping {
  /** Bắt buộc để tính phí vận chuyển. */
  @Prop({ default: 500, min: 1 })
  weightGram: number;

  @Prop({ min: 0 })
  lengthCm?: number;

  @Prop({ min: 0 })
  widthCm?: number;

  @Prop({ min: 0 })
  heightCm?: number;
}
const ProductShippingSchema = SchemaFactory.createForClass(ProductShipping);

/**
 * Số liệu denormalize để xếp hạng & hiển thị danh sách.
 * `ratingAvg`/`ratingCount` do collection Review cập nhật — KHÔNG tính lại
 * bằng aggregate mỗi lần load danh sách (quá đắt).
 */
@Schema({ _id: false })
export class ProductStats {
  @Prop({ default: 0 })
  views: number;

  @Prop({ default: 0 })
  sold: number;

  @Prop({ default: 0 })
  favorites: number;

  @Prop({ default: 0 })
  ratingAvg: number;

  @Prop({ default: 0 })
  ratingCount: number;

  /** Số lượt theo từng mức sao, index 0 = 1 sao. */
  @Prop({ type: [Number], default: [0, 0, 0, 0, 0] })
  ratingBreakdown: number[];
}
const ProductStatsSchema = SchemaFactory.createForClass(ProductStats);

/**
 * Ảnh chụp khuyến mãi đang chạy, do collection Promotion ghi xuống.
 * Giá gốc trong `variants` KHÔNG bị ghi đè — nếu ghi đè sẽ mất giá niêm yết,
 * không khôi phục được khi hết sale và không hiển thị nổi "giảm 30%".
 */
@Schema({ _id: false })
export class ActiveDeal {
  /**
   * Giá bán trong thời gian khuyến mãi — áp cho MỌI phân loại.
   *
   * 🔴 Bắt buộc thấp hơn `priceMin` (phân loại rẻ nhất). Thẻ sản phẩm tính
   * phần trăm giảm và gạch ngang đều dựa trên `priceMin`, nên giá sale cao hơn
   * nó sẽ hiện "giá khuyến mãi" đắt hơn "giá gốc" — vô lý với người mua.
   */
  @Prop({ required: true, min: 0 })
  price: number;

  /**
   * Mốc bắt đầu. Để trống = chạy ngay.
   * Có trường này thì mới hẹn giờ được flash sale thay vì phải ngồi canh bấm.
   */
  @Prop()
  startsAt?: Date;

  @Prop({ required: true })
  endsAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Promotion' })
  promotion?: Types.ObjectId;

  /**
   * Tự động đánh dấu lúc ĐẶT khuyến mãi (không tính lại sau đó — "chốt" giống
   * mọi snapshot khác trong hệ thống): `priceMin` dùng làm giá gốc vừa mới bị
   * tăng ngay trước đó, nghi ngờ dựng giá ảo để tạo cảm giác giảm giá hời.
   * Xem `PriceHistoryService.findPreHikeReference` + `PromotionsService.setDeal`.
   */
  @Prop({ default: false })
  flagged: boolean;

  @Prop({ trim: true, maxlength: 300 })
  flagReason?: string;
}
const ActiveDealSchema = SchemaFactory.createForClass(ActiveDeal);

/* -------------------------------- Product -------------------------------- */

@Schema({ timestamps: true })
export class Product {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true,
  })
  shop: Types.ObjectId;

  @Prop({ trim: true, required: true, maxlength: 150 })
  name: string;

  @Prop({
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true,
    maxlength: 80,
  })
  slug?: string;

  @Prop({ maxlength: 5000 })
  description?: string;

  /* ------------------------------ Phân loại ------------------------------ */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Category',
    required: true,
    index: true,
  })
  category: Types.ObjectId;

  /** Tổ tiên + chính nó → lọc cả nhánh danh mục bằng một index. */
  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Category' }],
    default: [],
    index: true,
  })
  categoryPath: Types.ObjectId[];

  /* ------------------------- Biến thể (tối đa 2 tầng) --------------------- */
  @Prop({ type: [OptionTierSchema], default: [] })
  optionTiers: OptionTier[];

  @Prop({ type: [ProductVariantSchema], default: [] })
  variants: ProductVariant[];

  /* --- Denormalize từ variants: lọc/sắp xếp danh sách khỏi phải mở mảng --- */
  @Prop({ default: 0, index: true })
  priceMin: number;

  @Prop({ default: 0 })
  priceMax: number;

  @Prop({ default: 0, index: true })
  totalStock: number;

  @Prop({ type: ActiveDealSchema })
  activeDeal?: ActiveDeal;

  /* -------------------------------- Media -------------------------------- */
  @Prop({ type: [ProductImageSchema], default: [] })
  images: ProductImage[];

  @Prop({ type: ProductImageSchema })
  video?: ProductImage;

  @Prop({ type: [ProductAttributeSchema], default: [] })
  attributes: ProductAttribute[];

  @Prop({ type: ProductShippingSchema, default: () => ({}) })
  shipping: ProductShipping;

  /* ------------------------------ Tìm kiếm ------------------------------- */
  /** Tên + mô tả + thuộc tính, ĐÃ BỎ DẤU — để "ao thun" tìm ra "áo thun". */
  @Prop({ default: '' })
  searchText: string;

  /**
   * Vector cho tìm kiếm ngữ nghĩa. `select: false` vì ~1536 số thực (~6KB):
   * trả về trong mọi query sẽ làm chậm toàn bộ danh sách sản phẩm.
   */
  @Prop({ type: [Number], select: false })
  embedding?: number[];

  @Prop()
  embeddingModel?: string;

  @Prop()
  embeddingAt?: Date;

  /* ------------------------- Thống kê & vòng đời -------------------------- */
  @Prop({ type: ProductStatsSchema, default: () => ({}) })
  stats: ProductStats;

  @Prop({ type: String, enum: PRODUCT_STATUS, default: 'draft', index: true })
  status: ProductStatus;

  /**
   * Cổng kiểm duyệt TRƯỚC KHI hiển thị: sản phẩm mới đăng hoặc vừa sửa nội
   * dung quan trọng (ảnh/tên/mô tả/ngành hàng) chuyển về `pending`, AI xét
   * duyệt trong ít phút — chỉ `ok` mới lên trang buyer (xem
   * `CatalogService.visibleProductMatch`). `reviewedBy` phân biệt quyết định
   * của AI hay admin ghi đè tay; lịch sử đầy đủ nằm ở `ModerationLog`.
   */
  @Prop({
    type: {
      state: String,
      reason: String,
      reviewedAt: Date,
      reviewedBy: String,
    },
    default: () => ({ state: 'ok' }),
    _id: false,
  })
  moderation: {
    state: ModerationState;
    reason?: string;
    reviewedAt?: Date;
    reviewedBy?: 'ai' | 'admin';
  };

  @Prop()
  publishedAt?: Date;

  /** Xoá mềm — giữ lại để đơn hàng cũ còn tham chiếu được. */
  @Prop({ type: Date, default: null, index: true })
  deletedAt?: Date | null;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

/* --------------------------------- Index ---------------------------------- */
// Danh sách sản phẩm của seller (lọc theo trạng thái, mới nhất trước).
ProductSchema.index({ shop: 1, status: 1, createdAt: -1 });
// Người mua duyệt theo danh mục.
ProductSchema.index({ categoryPath: 1, status: 1, deletedAt: 1 });
// Xếp theo bán chạy / đánh giá.
ProductSchema.index({ status: 1, 'stats.sold': -1 });
ProductSchema.index({ status: 1, 'stats.ratingAvg': -1 });
// Tìm kiếm từ khoá trên chuỗi đã bỏ dấu.
ProductSchema.index({ searchText: 'text' });
// Hàng chờ kiểm duyệt admin: lọc theo trạng thái duyệt, sort theo lần sửa cuối.
ProductSchema.index({ deletedAt: 1, 'moderation.state': 1, updatedAt: 1 });
// Trang khuyến mãi admin: sort theo hạn kết thúc deal.
ProductSchema.index({ 'activeDeal.endsAt': 1 });
