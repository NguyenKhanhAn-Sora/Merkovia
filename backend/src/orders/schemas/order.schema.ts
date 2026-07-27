import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

/**
 * Vòng đời đơn hàng.
 *
 * - `pending_payment`: chờ thanh toán online. Kho ĐÃ bị giữ, nhưng chỉ giữ tới
 *   `paymentExpiresAt` — quá hạn thì job tự huỷ và hoàn kho.
 * - `pending`: chờ người bán xác nhận (đơn COD vào thẳng đây).
 * - `confirmed`: người bán đã nhận đơn, đang chuẩn bị hàng.
 * - `shipping`: đã bàn giao cho vận chuyển.
 * - `delivered`: giao thành công — trạng thái kết thúc.
 * - `cancelled`: đã huỷ — trạng thái kết thúc, kho đã hoàn.
 * - `returned`: người mua đã trả hàng (sau khi giao) và được duyệt — trạng
 *   thái kết thúc, tiền phải hoàn cho người mua.
 */
export const ORDER_STATUS = [
  'pending_payment',
  'pending',
  'confirmed',
  'shipping',
  'delivered',
  'cancelled',
  'returned',
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];

/** Trạng thái đã kết thúc — không chuyển đi đâu được nữa. */
export const TERMINAL_STATUS: readonly OrderStatus[] = [
  'delivered',
  'cancelled',
  'returned',
];

/**
 * Chuyển trạng thái hợp lệ. Máy trạng thái nằm ở MỘT chỗ duy nhất để không có
 * đường tắt nào lách được (vd nhảy thẳng pending → delivered, hay lùi ngược).
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> =
  {
    pending_payment: ['pending', 'cancelled'],
    pending: ['confirmed', 'cancelled'],
    confirmed: ['shipping', 'cancelled'],
    // `cancelled` ở đây là GIAO THẤT BẠI (hàng trả về người bán). Không có
    // đường này thì đơn giao hỏng kẹt ở "Đang giao" vĩnh viễn: kho không được
    // hoàn, tiền không ai trả lại.
    shipping: ['delivered', 'cancelled'],
    // `returned` KHÔNG nằm ở đây: trả hàng đi đường riêng có duyệt của người
    // bán và điều kiện thời gian, không phải một bước người bán tự đẩy tới.
    delivered: [],
    cancelled: [],
    returned: [],
  };

export const PAYMENT_METHODS = ['cod', 'online'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CANCELLED_BY = ['buyer', 'seller', 'system'] as const;
export type CancelledBy = (typeof CANCELLED_BY)[number];

/**
 * Một dòng hàng trong đơn — **bản chụp tại thời điểm đặt**.
 *
 * Đây là điểm mấu chốt khiến "người bán xoá sản phẩm không làm hỏng đơn cũ"
 * thành sự thật: mọi thứ cần để hiển thị lịch sử mua hàng đều nằm sẵn ở đây.
 * `product`/`variant` chỉ dùng để hoàn kho và trỏ link — TUYỆT ĐỐI không join
 * sang Product để lấy tên/giá khi hiện đơn, vì sản phẩm có thể đã đổi giá,
 * đổi tên hoặc bị xoá.
 */
@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  product: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  variant: Types.ObjectId;

  /** Slug tại thời điểm đặt — để link về trang sản phẩm nếu còn sống. */
  @Prop({ trim: true })
  productSlug?: string;

  @Prop({ trim: true, required: true })
  name: string;

  @Prop()
  image?: string;

  /** Nhãn phân loại đã chọn, vd "Đỏ / M". Rỗng nếu không phân loại. */
  @Prop({ trim: true, default: '' })
  variantLabel: string;

  @Prop({ trim: true })
  sku?: string;

  /** Đơn giá thực trả (VND, số nguyên) — đã áp khuyến mãi nếu có. */
  @Prop({ required: true, min: 0 })
  price: number;

  /** Giá niêm yết lúc đặt; bằng `price` nếu không giảm giá. */
  @Prop({ required: true, min: 0 })
  originalPrice: number;

  @Prop({ required: true, min: 1 })
  quantity: number;

  /** `price * quantity` — lưu sẵn để không phải tính lại khi hiển thị. */
  @Prop({ required: true, min: 0 })
  subtotal: number;
}
const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

/** Địa chỉ giao hàng — cũng là bản chụp, người mua đổi sổ địa chỉ không ảnh hưởng đơn cũ. */
@Schema({ _id: false })
export class ShippingAddress {
  /**
   * Loại địa điểm ("Nhà riêng", "Văn phòng"…). Chụp lại theo đơn vì nó đổi
   * được cách giao: giao tới văn phòng thì ngoài giờ hành chính là không ai
   * nhận. Người bán cần thấy giá trị lúc ĐẶT, không phải giá trị hiện tại
   * trong sổ địa chỉ.
   */
  @Prop({ trim: true })
  label?: string;

  @Prop({ trim: true, required: true })
  recipientName: string;

  @Prop({ trim: true, required: true })
  recipientPhone: string;

  @Prop({ trim: true, required: true })
  street: string;

  @Prop({ trim: true })
  ward?: string;

  @Prop()
  wardCode?: number;

  @Prop({ trim: true })
  district?: string;

  @Prop({ trim: true, required: true })
  province: string;

  @Prop()
  provinceCode?: number;

  /* Toạ độ chụp lại theo đơn — dùng để tạo vận đơn và đối chiếu về sau. */
  @Prop()
  lat?: number;

  @Prop()
  lng?: number;

  @Prop({ trim: true, default: 'Việt Nam' })
  country: string;
}
const ShippingAddressSchema = SchemaFactory.createForClass(ShippingAddress);

export const CANCEL_REQUEST_STATUS = [
  'pending',
  'approved',
  'rejected',
] as const;
export type CancelRequestStatus = (typeof CANCEL_REQUEST_STATUS)[number];

/** Lý do huỷ đơn — cố định để người bán lọc/thống kê, tránh gõ tự do lộn xộn. */
export const CANCEL_REASONS = [
  'changed_mind', // đổi ý, không muốn mua nữa
  'ordered_wrong', // đặt nhầm sản phẩm/phân loại/số lượng
  'found_better_price', // tìm được nơi bán rẻ hơn
  'update_info', // muốn đổi địa chỉ/thanh toán
  'delivery_too_long', // thời gian giao dự kiến quá lâu
  'other',
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

/**
 * Yêu cầu huỷ đơn của người mua SAU khi người bán đã xác nhận.
 *
 * Trước lúc đó người mua tự huỷ thẳng. Sau lúc đó thì hàng có thể đã đóng gói
 * nên phải hỏi ý người bán — nhưng cũng không thể chặn cứng: người mua chuyển
 * nhà sang tỉnh khác mà không có đường ra thì chỉ còn cách từ chối nhận hàng,
 * tệ hơn cho cả hai.
 */
@Schema({ _id: false })
export class CancelRequest {
  /** Nhóm lý do có sẵn; `other` thì người mua tự nhập ở `reason`. */
  @Prop({ type: String, enum: CANCEL_REASONS })
  reasonType?: CancelReason;

  @Prop({ trim: true, maxlength: 300 })
  reason?: string;

  @Prop({ required: true })
  requestedAt: Date;

  @Prop({
    type: String,
    enum: CANCEL_REQUEST_STATUS,
    default: 'pending',
    required: true,
  })
  status: CancelRequestStatus;

  @Prop()
  respondedAt?: Date;

  /** Lý do người bán từ chối — người mua cần biết vì sao. */
  @Prop({ trim: true, maxlength: 300 })
  sellerNote?: string;
}
const CancelRequestSchema = SchemaFactory.createForClass(CancelRequest);

/** Lý do trả hàng — cố định để người bán lọc/thống kê, tránh gõ tự do lộn xộn. */
export const RETURN_REASONS = [
  'damaged', // hàng vỡ/hỏng khi nhận
  'wrong_item', // giao sai sản phẩm/phân loại
  'not_as_described', // khác mô tả/hình ảnh
  'missing_parts', // thiếu phụ kiện/số lượng
  'other',
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_REQUEST_STATUS = [
  'requested',
  'approved',
  'rejected',
] as const;
export type ReturnRequestStatus = (typeof RETURN_REQUEST_STATUS)[number];

/**
 * Yêu cầu trả hàng của người mua SAU khi đã giao thành công.
 *
 * Khác `CancelRequest` (chỉ trước khi giao): trả hàng xảy ra khi hàng đã tới
 * tay người mua rồi mới phát hiện vấn đề. Duyệt là chấp nhận trả và hoàn tiền —
 * việc chuyển hàng ngược về người bán nằm ngoài hệ thống ở phiên bản này.
 */
@Schema({ _id: false })
export class ReturnRequest {
  @Prop({ type: String, enum: RETURN_REASONS, required: true })
  reasonType: ReturnReason;

  /** Mô tả của người mua — bắt buộc khi lý do là "other", còn lại tuỳ chọn. */
  @Prop({ trim: true, maxlength: 500 })
  reason?: string;

  @Prop({ required: true })
  requestedAt: Date;

  @Prop({
    type: String,
    enum: RETURN_REQUEST_STATUS,
    default: 'requested',
    required: true,
  })
  status: ReturnRequestStatus;

  @Prop()
  respondedAt?: Date;

  /** Lời nhắn của người bán khi duyệt/từ chối. */
  @Prop({ trim: true, maxlength: 300 })
  sellerNote?: string;
}
const ReturnRequestSchema = SchemaFactory.createForClass(ReturnRequest);

/** Một mốc trong lịch sử đơn — dựng nên dòng thời gian hiển thị hai phía. */
@Schema({ _id: false })
export class OrderEvent {
  @Prop({ type: String, enum: ORDER_STATUS, required: true })
  status: OrderStatus;

  @Prop({ required: true })
  at: Date;

  /** Ai gây ra chuyển trạng thái này. */
  @Prop({ trim: true })
  by?: string;

  @Prop({ trim: true, maxlength: 300 })
  note?: string;
}
const OrderEventSchema = SchemaFactory.createForClass(OrderEvent);

/**
 * Order — MỘT đơn thuộc về MỘT gian hàng.
 *
 * Giỏ hàng nhiều shop sẽ được tách thành nhiều đơn khi thanh toán (giống
 * Shopee/Lazada), vì mỗi shop tự xác nhận, tự đóng gói và tự giao. Các đơn
 * cùng một lần bấm "Đặt hàng" chia sẻ `checkoutGroup` để người mua vẫn thấy
 * chúng như một lần mua.
 */
@Schema({ timestamps: true })
export class Order {
  /** Mã đơn cho người dùng đọc/tra cứu, vd "MK8F3K2QD1". */
  @Prop({ trim: true, uppercase: true, required: true, unique: true })
  orderCode: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  buyer: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Shop', required: true, index: true })
  shop: Types.ObjectId;

  /* Bản chụp thông tin shop — đơn cũ vẫn hiện đúng tên dù shop đã đổi tên. */
  @Prop({ trim: true, required: true })
  shopName: string;

  @Prop({ trim: true })
  shopSlug?: string;

  /** Nhóm các đơn được tạo trong cùng một lần thanh toán. */
  @Prop({ type: Types.ObjectId, index: true })
  checkoutGroup?: Types.ObjectId;

  @Prop({ type: [OrderItemSchema], required: true })
  items: OrderItem[];

  /* ------------------------------ Tiền bạc ------------------------------ */
  /** Tổng tiền hàng, chưa gồm vận chuyển. */
  @Prop({ required: true, min: 0 })
  itemsTotal: number;

  @Prop({ required: true, min: 0, default: 0 })
  shippingFee: number;

  @Prop({ required: true, min: 0, default: 0 })
  discount: number;

  /** Số tiền cuối cùng người mua trả. */
  @Prop({ required: true, min: 0 })
  total: number;

  /* ----------------------------- Trạng thái ----------------------------- */
  @Prop({ type: String, enum: ORDER_STATUS, required: true, index: true })
  status: OrderStatus;

  @Prop({ type: [OrderEventSchema], default: [] })
  timeline: OrderEvent[];

  @Prop({ type: String, enum: CANCELLED_BY })
  cancelledBy?: CancelledBy;

  /** Nhóm lý do huỷ (người mua chọn); `other` thì nội dung tự nhập ở `cancelReason`. */
  @Prop({ type: String, enum: CANCEL_REASONS })
  cancelReasonType?: CancelReason;

  @Prop({ trim: true, maxlength: 300 })
  cancelReason?: string;

  /**
   * Kho của đơn này đã được hoàn lại chưa.
   *
   * 🔴 Cờ chống hoàn kho HAI LẦN. Một đơn có thể bị huỷ từ nhiều đường cùng
   * lúc (người mua bấm huỷ đúng lúc job quét đơn quá hạn chạy). Mọi đường huỷ
   * đều phải giành cờ này bằng updateOne có điều kiện, chỉ ai đặt được cờ mới
   * được gọi `releaseStock`.
   */
  @Prop({ default: false })
  stockReleased: boolean;

  /**
   * Khối lượng tính cước đã chốt lúc đặt (gram).
   *
   * Lưu lại để tính LẠI cước khi người mua đổi địa chỉ — nếu không thì phải
   * đọc lại từng sản phẩm, mà người bán có thể đã sửa khối lượng từ lúc đó,
   * dẫn tới cước mới lệch khỏi cước đáng ra phải tính.
   */
  @Prop({ default: 0 })
  weightGram: number;

  /**
   * Lần cuối người mua sửa địa chỉ giao hàng.
   * Người bán cần thấy mốc này: sửa sau khi họ đã in nhãn nghĩa là phải in lại.
   */
  @Prop()
  addressUpdatedAt?: Date;

  /** Yêu cầu huỷ đơn đang chờ người bán duyệt (chỉ có sau khi đã xác nhận). */
  @Prop({ type: CancelRequestSchema })
  cancelRequest?: CancelRequest;

  /** Yêu cầu trả hàng (chỉ có sau khi đã giao thành công). */
  @Prop({ type: ReturnRequestSchema })
  returnRequest?: ReturnRequest;

  /** Mốc trả hàng được duyệt — đơn chuyển sang `returned`. */
  @Prop()
  returnedAt?: Date;

  /**
   * Người mua cần được hoàn `total` (đơn đã trả hàng hoặc huỷ sau khi đã trả
   * tiền). Với đơn online còn có cờ trên `Payment`; cờ này phủ CẢ đơn COD —
   * hàng COD đã giao nghĩa là người mua ĐÃ trả tiền mặt, trả hàng thì phải
   * hoàn lại, mà COD không có bản ghi `Payment` nào để gắn cờ.
   */
  @Prop({ default: false, index: true })
  buyerRefundPending: boolean;

  /** Số tiền phải hoàn cho người mua (chụp lại lúc phát sinh nghĩa vụ hoàn). */
  @Prop({ default: 0 })
  buyerRefundAmount: number;

  /* ---------------------------- Thanh toán ------------------------------ */
  @Prop({ type: String, enum: PAYMENT_METHODS, required: true })
  paymentMethod: PaymentMethod;

  @Prop()
  paidAt?: Date;

  /**
   * Hạn giữ kho cho đơn chờ thanh toán online. Quá hạn mà chưa trả tiền thì
   * job tự huỷ — nếu không, hàng bị giam vô thời hạn bởi đơn không ai trả.
   */
  @Prop({ index: true })
  paymentExpiresAt?: Date;

  /** Phiên thanh toán online đã trả cho đơn này (COD thì không có). */
  @Prop({ type: Types.ObjectId, ref: 'Payment', index: true })
  payment?: Types.ObjectId;

  /* ------------------------------ Chi trả ------------------------------- */
  /** Mốc giao thành công — gốc để tính thời gian giữ tiền trước khi chi trả. */
  @Prop({ index: true })
  deliveredAt?: Date;

  /**
   * Đợt chi trả đã bao gồm đơn này.
   * 🔴 Là khoá chống trả tiền hai lần: gom đơn vào payout dùng điều kiện
   * `payout: null`, nên một đơn không thể lọt vào hai đợt chi.
   */
  @Prop({ type: Types.ObjectId, ref: 'Payout', default: null, index: true })
  payout?: Types.ObjectId | null;

  /* ------------------------------- Khác --------------------------------- */
  /** Lời nhắn của người mua cho người bán. */
  @Prop({ trim: true, maxlength: 500 })
  note?: string;

  @Prop({ type: ShippingAddressSchema, required: true })
  shippingAddress: ShippingAddress;

  /**
   * Khoá chống tạo trùng do bấm đúp nút "Đặt hàng" hoặc client tự thử lại.
   * Unique + sparse: lần thứ hai với cùng khoá sẽ đụng index thay vì tạo đơn
   * mới và trừ kho thêm một lần nữa.
   */
  @Prop({ trim: true, unique: true, sparse: true })
  clientToken?: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

// Danh sách đơn luôn lọc theo người mua hoặc shop rồi sắp xếp mới-nhất-trước.
OrderSchema.index({ buyer: 1, createdAt: -1 });
OrderSchema.index({ shop: 1, status: 1, createdAt: -1 });
