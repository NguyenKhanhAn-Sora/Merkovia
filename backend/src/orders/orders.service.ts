import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ALLOWED_TRANSITIONS,
  CancelReason,
  Order,
  OrderDocument,
  OrderItem,
  OrderStatus,
  PaymentMethod,
} from './schemas/order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { Address, AddressDocument } from '../addresses/schemas/address.schema';
import { ProductsService, StockItem } from '../products/products.service';
import {
  PAYMENT_GRACE_MINUTES,
  PaymentService,
} from '../payments/payment.service';
import {
  chargeableWeight,
  ShippingProvider,
  type ShippingQuote,
} from '../shipping/shipping.provider';
import {
  CreateOrderDto,
  QuoteCartDto,
  UpdateShippingAddressDto,
} from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { RequestReturnDto } from './dto/return.dto';
import { isDealLive } from '../products/deal';
import { shortId } from '../common/text';
import { config } from '../config/config';
import { NotificationsService } from '../notifications/notifications.service';
import type { UserDocument } from '../users/schemas/user.schema';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';

/**
 * Một yêu cầu huỷ/trả hàng đang chờ của gian hàng ĐANG BỊ ĐÌNH CHỈ — cần admin
 * xử lý thay vì để shop tự duyệt (shop đang bị đình chỉ có động cơ từ chối
 * để giữ tiền, xung đột lợi ích trực tiếp với chính yêu cầu đang xét).
 */
export interface OrderDisputeItem {
  orderId: string;
  orderCode: string;
  shopId: string;
  shopName: string;
  type: 'cancel' | 'return';
  reasonType?: string;
  reason?: string;
  requestedAt: Date;
  buyerContact: string;
  total: number;
}

/**
 * Phần giỏ hàng mà `buildGroups` thực sự cần.
 *
 * Khai báo tối thiểu như vậy để cả `QuoteCartDto` (chỉ có thông tin địa lý) và
 * `CreateOrderDto` (đầy đủ người nhận) đều dùng chung được một đường tính —
 * đó là thứ bảo đảm giá báo cho người mua đúng bằng giá bị trừ.
 */
interface CartInput {
  items: { productId: string; variantId: string; quantity: number }[];
  shippingAddress: {
    provinceCode?: number;
    wardCode?: number;
    lat?: number;
    lng?: number;
  };
  paymentMethod: string;
}

/** Thời gian giữ kho cho đơn chờ thanh toán online. */
const PAYMENT_WINDOW_MINUTES = 15;

/**
 * Số ngày kể từ lúc bàn giao vận chuyển thì tự coi là đã giao thành công.
 *
 * Đặt rộng hơn mức giao chậm nhất của biểu cước (tuyến xa 6 ngày) cộng thêm
 * vài ngày để người mua kịp phản hồi — chốt sớm quá là chốt lúc hàng còn trên
 * đường, mà `delivered` thì mở khoá tiền cho người bán.
 */
const AUTO_CONFIRM_DAYS = 10;

/** Người mua chỉ được huỷ khi người bán chưa bắt đầu chuẩn bị hàng. */
/**
 * Trạng thái còn sửa được địa chỉ. `shipping` trở đi thì hàng đã ở tay hãng
 * vận chuyển — sửa trong hệ thống mình cũng không đổi được nơi hàng thực sự
 * đến, chỉ khiến hai bên hiểu sai nhau.
 */
const ADDRESS_EDITABLE: readonly OrderStatus[] = [
  'pending_payment',
  'pending',
  'confirmed',
];

const BUYER_CANCELLABLE: readonly OrderStatus[] = [
  'pending_payment',
  'pending',
];
/** Người bán được từ chối đơn cho tới trước khi bàn giao vận chuyển. */
const SELLER_CANCELLABLE: readonly OrderStatus[] = ['pending', 'confirmed'];

/** Số ngày kể từ lúc giao thành công mà người mua còn được yêu cầu trả hàng. */
const RETURN_WINDOW_DAYS = config.returnWindowDays;

/**
 * SLA xử lý đơn của người bán (giờ) — xem chú thích ở `config.order` cho lý
 * do chia hai mốc nhắc/huỷ thay vì cắt cứng một lần.
 */
const ORDER_CONFIRM_HOURS = config.order.confirmHours;
const ORDER_CONFIRM_WARN_HOURS = config.order.confirmWarnHours;
const ORDER_SHIP_HOURS = config.order.shipHours;
const ORDER_SHIP_WARN_HOURS = config.order.shipWarnHours;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    @InjectModel(Address.name)
    private readonly addressModel: Model<AddressDocument>,
    private readonly products: ProductsService,
    private readonly payments: PaymentService,
    private readonly shipping: ShippingProvider,
    private readonly notifications: NotificationsService,
  ) {}

  /** Mô tả ngắn các món trong đơn cho nội dung thông báo. */
  private itemsSummary(order: OrderDocument): string {
    const first = order.items[0]?.name ?? 'sản phẩm';
    const more = order.items.length - 1;
    return more > 0 ? `${first} và ${more} sản phẩm khác` : first;
  }

  /* ------------------------------ Tiện ích ------------------------------- */

  /** Mã đơn cho người dùng đọc — kèm mốc thời gian nên gần như không đụng nhau. */
  private newOrderCode(): string {
    return `MK${Date.now().toString(36)}${shortId()}`.toUpperCase();
  }

  /**
   * Chỉ giữ khuyến mãi ĐANG chạy VÀ thực sự rẻ hơn giá niêm yết.
   *
   * 🔴 Đây là chỗ tính TIỀN THẬT, nên phải kiểm cả hai đầu thời gian: quên
   * `startsAt` thì một chương trình hẹn giờ cho tuần sau đã được tính giá ngay
   * hôm nay. Dùng chung `isDealLive` với chỗ hiển thị để hai nơi không lệch.
   */
  private dealPrice(product: ProductDocument, listPrice: number): number {
    const deal = product.activeDeal;
    if (!isDealLive(deal)) return listPrice;
    return deal!.price < listPrice ? deal!.price : listPrice;
  }

  /** Các dòng hàng của đơn dưới dạng đầu vào cho giữ/hoàn kho. */
  private stockItemsOf(orders: OrderDocument[]): StockItem[] {
    return orders.flatMap((o) =>
      o.items.map((i) => ({
        productId: String(i.product),
        variantId: String(i.variant),
        quantity: i.quantity,
      })),
    );
  }

  private async requireShop(user: UserDocument): Promise<ShopDocument> {
    const shop = await this.shopModel.findOne({ owner: user._id });
    if (!shop) throw new ForbiddenException('Tài khoản chưa có gian hàng.');
    return shop;
  }

  /* ------------------------------ Đặt hàng ------------------------------- */

  /**
   * Thông tin dựng sẵn cho trang thanh toán: sổ địa chỉ của người mua.
   * Địa chỉ mặc định xếp đầu để form tự điền.
   */
  async checkoutInfo(user: UserDocument) {
    const addresses = await this.addressModel
      .find({ user: user._id })
      .sort({ isDefault: -1, updatedAt: -1 })
      .lean();

    return {
      addresses: addresses.map((a) => ({
        id: String(a._id),
        label: a.label,
        recipientName: a.recipientName,
        recipientPhone: a.recipientPhone,
        street: a.street,
        ward: a.ward,
        wardCode: a.wardCode,
        district: a.district,
        province: a.province,
        // Mã + toạ độ để trang thanh toán tính được cước ngay khi mở.
        provinceCode: a.provinceCode,
        lat: a.lat,
        lng: a.lng,
        isDefault: a.isDefault,
      })),
    };
  }

  /**
   * Báo giá giỏ hàng trước khi đặt: tiền hàng, cước vận chuyển từng gian hàng.
   *
   * 🔴 Dùng CHUNG `buildGroups` với `checkout`, không tính lại theo công thức
   * riêng. Nếu tách hai đường, con số người mua nhìn thấy sẽ có ngày lệch con
   * số bị trừ — và đó là loại lỗi người dùng mất niềm tin ngay lập tức.
   *
   * Không giữ kho, không ghi gì.
   */
  async quote(user: UserDocument, dto: QuoteCartDto) {
    const { groups } = await this.buildGroups(user, dto);

    const shops = groups.map((g) => ({
      shopId: String(g.shop._id),
      shopName: g.shop.name,
      itemCount: g.items.reduce((n, i) => n + i.quantity, 0),
      itemsTotal: g.itemsTotal,
      weightGram: g.weightGram,
      shippingFee: g.shippingFee,
      baseShippingFee: g.shipping?.baseFee ?? g.shippingFee,
      freeShipping: g.shipping?.freeShipping ?? false,
      zone: g.shipping?.zone,
      distanceKm: g.shipping?.distanceKm,
      // Ngày giao dự kiến = thời gian shop chuẩn bị hàng + thời gian vận chuyển.
      etaDays: g.shipping
        ? {
            min: g.shipping.etaDays.min + (g.shop.preparationDays ?? 0),
            max: g.shipping.etaDays.max + (g.shop.preparationDays ?? 0),
          }
        : undefined,
      serviceName: g.shipping?.serviceName,
    }));

    const itemsTotal = shops.reduce((s, g) => s + g.itemsTotal, 0);
    const shippingTotal = shops.reduce((s, g) => s + g.shippingFee, 0);

    return {
      shops,
      itemsTotal,
      shippingTotal,
      shippingSaved: shops.reduce(
        (s, g) => s + (g.baseShippingFee - g.shippingFee),
        0,
      ),
      total: itemsTotal + shippingTotal,
      carrier: {
        name: this.shipping.name,
        isCarrier: this.shipping.isCarrier,
      },
    };
  }

  /**
   * Tạo đơn từ giỏ hàng.
   *
   * Thứ tự các bước là CÓ CHỦ Ý:
   *  1. Trả sớm nếu `clientToken` đã dùng → bấm đúp không tạo đơn thứ hai.
   *  2. Tra sản phẩm & tính tiền **phía server** — không tin giá client gửi.
   *  3. Giữ kho nguyên tử cho TOÀN BỘ giỏ trước khi ghi đơn nào. Thiếu một món
   *     là hỏng cả lượt, không để người mua trả tiền cho giỏ chỉ mua được nửa.
   *  4. Ghi đơn. Hỏng ở bước này thì đền bù: xoá đơn đã tạo + hoàn kho.
   */
  async checkout(user: UserDocument, dto: CreateOrderDto) {
    if (dto.clientToken) {
      const existing = await this.findByClientToken(user, dto.clientToken);
      if (existing) return existing;
    }

    const { groups, stockItems } = await this.buildGroups(user, dto);

    // Giữ kho trước — thất bại thì `reserveStock` đã tự hoàn phần giữ dở dang.
    await this.products.reserveStock(stockItems);

    const checkoutGroup = new Types.ObjectId();
    const created: OrderDocument[] = [];
    try {
      for (const [index, group] of groups.entries()) {
        const order = await new this.orderModel({
          orderCode: this.newOrderCode(),
          buyer: user._id,
          shop: group.shop._id,
          shopName: group.shop.name,
          shopSlug: group.shop.slug,
          checkoutGroup,
          items: group.items,
          itemsTotal: group.itemsTotal,
          shippingFee: group.shippingFee,
          // Chốt lại khối lượng để sau còn tính lại cước khi đổi địa chỉ.
          weightGram: group.weightGram,
          discount: 0,
          total: group.itemsTotal + group.shippingFee,
          status: group.status,
          paymentMethod: dto.paymentMethod as PaymentMethod,
          paymentExpiresAt: group.paymentExpiresAt,
          sellerActionDeadlineAt: group.sellerActionDeadlineAt,
          sellerActionWarnAt: group.sellerActionWarnAt,
          note: dto.note?.trim(),
          shippingAddress: dto.shippingAddress,
          timeline: [{ status: group.status, at: new Date(), by: 'buyer' }],
          // Chỉ đơn đầu nhóm mang khoá chống trùng: index là unique toàn cục
          // nên gắn cho mọi đơn sẽ tự đụng nhau ngay trong cùng một lượt đặt.
          clientToken: index === 0 ? dto.clientToken : undefined,
        }).save();
        created.push(order);
      }
    } catch (e: unknown) {
      await this.compensate(created, stockItems);

      // Hai request cùng token chạy song song: kẻ thua trả về đơn của kẻ thắng.
      if (this.isDuplicateKey(e) && dto.clientToken) {
        const existing = await this.findByClientToken(user, dto.clientToken);
        if (existing) return existing;
      }
      throw e;
    }

    await this.rememberFirstAddress(user, dto.shippingAddress);

    // COD vào thẳng `pending` nên báo đơn mới cho người bán ngay. Đơn online
    // đợi thanh toán xong mới báo (trong `PaymentService.applyPaid`).
    if (dto.paymentMethod === 'cod') {
      for (const o of created) {
        await this.notifications.notifyShop(o.shop, {
          type: 'new_order',
          title: 'Bạn có đơn hàng mới',
          body: `Đơn ${o.orderCode}: ${this.itemsSummary(o)}.`,
          link: `/orders/${String(o._id)}`,
          data: { orderId: String(o._id), orderCode: o.orderCode },
        });
      }
    }

    // Đơn online cần một phiên thanh toán cho CẢ nhóm — người mua trả một lần
    // cho toàn giỏ, không phải trả riêng từng gian hàng.
    let payment: ReturnType<PaymentService['publicPayment']> | null = null;
    if (dto.paymentMethod === 'online') {
      const doc = await this.payments.createForCheckout({
        buyer: user._id,
        checkoutGroup,
        orderIds: created.map((o) => o._id),
        amount: created.reduce((sum, o) => sum + o.total, 0),
        expiresAt: created[0].paymentExpiresAt!,
      });
      payment = doc ? this.payments.publicPayment(doc) : null;
    }

    return {
      checkoutGroup: String(checkoutGroup),
      orders: created.map((o) => this.toBuyerOrder(o)),
      payment,
    };
  }

  /**
   * Sổ địa chỉ còn trống thì cất địa chỉ của đơn đầu tiên làm mặc định.
   *
   * Người vừa đăng ký xong đã mua ngay thì chưa từng vào trang Tài khoản; gõ
   * lại nguyên địa chỉ ở đơn thứ hai là phiền vô cớ. Cố ý CHỈ lưu địa chỉ, KHÔNG
   * đụng tới số điện thoại của tài khoản — số người nhận rất có thể là của
   * người khác (mua quà gửi mẹ), tự gán vào hồ sơ là gán nhầm danh tính.
   *
   * 🔴 Không bao giờ để hỏng đơn: đơn đã ghi và kho đã trừ xong rồi, tiện ích
   * này mà ném lỗi thì người mua thấy "đặt hàng thất bại" cho một đơn thật ra
   * đã thành công.
   */
  private async rememberFirstAddress(
    user: UserDocument,
    address: CreateOrderDto['shippingAddress'],
  ) {
    try {
      const count = await this.addressModel.countDocuments({ user: user._id });
      if (count > 0) return;

      const created = await this.addressModel.create({
        user: user._id,
        label: address.label?.trim(),
        recipientName: address.recipientName,
        recipientPhone: address.recipientPhone,
        street: address.street,
        ward: address.ward,
        wardCode: address.wardCode,
        district: address.district,
        province: address.province,
        provinceCode: address.provinceCode,
        lat: address.lat,
        lng: address.lng,
        isDefault: true,
      });

      // Hai đơn đặt cùng lúc từ sổ trống thì cả hai đều thấy count 0. Dọn lại
      // để chắc chắn chỉ còn ĐÚNG MỘT mặc định, thay vì tin vào phép đếm.
      await this.addressModel.updateMany(
        { user: user._id, isDefault: true, _id: { $ne: created._id } },
        { $set: { isDefault: false } },
      );
    } catch (err: unknown) {
      this.logger.warn(`Không lưu được địa chỉ đầu tiên: ${String(err)}`);
    }
  }

  /** Xoá đơn lỡ tạo và trả kho — dùng khi ghi đơn thất bại giữa chừng. */
  private async compensate(created: OrderDocument[], stockItems: StockItem[]) {
    if (created.length) {
      await this.orderModel
        .deleteMany({ _id: { $in: created.map((o) => o._id) } })
        .catch((err: unknown) =>
          this.logger.error(`Không xoá được đơn lỗi: ${String(err)}`),
        );
    }
    await this.products
      .releaseStock(stockItems)
      .catch((err: unknown) =>
        this.logger.error(`Không hoàn được kho khi đền bù: ${String(err)}`),
      );
  }

  private isDuplicateKey(e: unknown): boolean {
    return (e as { code?: number })?.code === 11000;
  }

  private async findByClientToken(user: UserDocument, clientToken: string) {
    const first = await this.orderModel.findOne({
      clientToken,
      buyer: user._id,
    });
    if (!first) return null;

    const orders = await this.orderModel
      .find({ checkoutGroup: first.checkoutGroup })
      .sort({ createdAt: 1 });

    return {
      checkoutGroup: String(first.checkoutGroup),
      orders: orders.map((o) => this.toBuyerOrder(o)),
      duplicate: true, // để client biết đây là lần gửi lại, không phải đơn mới
    };
  }

  /**
   * Kiểm tra giỏ hàng và gom theo gian hàng.
   *
   * Mọi giá tiền ở đây đọc từ DB, không lấy từ payload. Mọi lý do từ chối đều
   * nói rõ tên sản phẩm để người mua biết phải sửa dòng nào.
   */
  private async buildGroups(user: UserDocument, dto: CartInput) {
    // Gộp dòng trùng (cùng sản phẩm + cùng phân loại) để không giữ kho hai lần
    // cho một món — client có thể gửi lên hai dòng giống nhau.
    const merged = new Map<
      string,
      { productId: string; variantId: string; quantity: number }
    >();
    for (const item of dto.items) {
      const key = `${item.productId}:${item.variantId}`;
      const prev = merged.get(key);
      if (prev) prev.quantity += item.quantity;
      else merged.set(key, { ...item });
    }
    const items = [...merged.values()];

    const products = await this.productModel.find({
      _id: { $in: items.map((i) => new Types.ObjectId(i.productId)) },
    });
    const byId = new Map(products.map((p) => [String(p._id), p]));

    // Nạp sẵn mọi shop liên quan trong một truy vấn.
    const shopIds = [...new Set(products.map((p) => String(p.shop)))];
    const shops = await this.shopModel.find({
      _id: { $in: shopIds.map((id) => new Types.ObjectId(id)) },
    });
    const shopById = new Map(shops.map((s) => [String(s._id), s]));

    const groups = new Map<
      string,
      {
        shop: ShopDocument;
        items: OrderItem[];
        itemsTotal: number;
        /** Khối lượng tính cước của cả kiện hàng shop này (gram). */
        weightGram: number;
        shippingFee: number;
        shipping?: ShippingQuote;
        status: OrderStatus;
        paymentExpiresAt?: Date;
        sellerActionDeadlineAt?: Date;
        sellerActionWarnAt?: Date;
      }
    >();

    for (const item of items) {
      const product = byId.get(item.productId);
      if (!product || product.deletedAt || product.status !== 'active') {
        throw new ConflictException(
          `"${product?.name ?? 'Một sản phẩm trong giỏ'}" đã ngừng bán hoặc bị gỡ.`,
        );
      }

      const shop = shopById.get(String(product.shop));
      if (!shop || shop.status !== 'active') {
        throw new ConflictException(
          `Gian hàng của "${product.name}" hiện không hoạt động.`,
        );
      }
      if (shop.vacationMode) {
        throw new ConflictException(
          `Gian hàng "${shop.name}" đang tạm nghỉ nên chưa nhận đơn mới.`,
        );
      }
      // Mua hàng của chính mình làm rối doanh thu và thống kê của shop.
      if (String(shop.owner) === String(user._id)) {
        throw new BadRequestException(
          'Bạn không thể đặt mua sản phẩm của chính gian hàng mình.',
        );
      }

      const variant = product.variants.find(
        (v) => String(v._id) === item.variantId,
      );
      if (!variant || variant.isActive === false) {
        throw new ConflictException(
          `Phân loại bạn chọn của "${product.name}" đã ngừng bán.`,
        );
      }

      const originalPrice = variant.price;
      const price = this.dealPrice(product, originalPrice);
      const subtotal = price * item.quantity;

      const key = String(shop._id);
      const group = groups.get(key) ?? {
        shop,
        items: [],
        itemsTotal: 0,
        weightGram: 0,
        shippingFee: 0,
        status: 'pending' as OrderStatus,
      };
      group.items.push({
        product: product._id,
        variant: variant._id!,
        productSlug: product.slug,
        name: product.name,
        image: variant.image ?? product.images?.[0]?.url,
        variantLabel: (variant.optionValues ?? []).join(' / '),
        sku: variant.sku,
        price,
        originalPrice,
        quantity: item.quantity,
        subtotal,
      });
      group.itemsTotal += subtotal;
      // Khối lượng tính cước cộng dồn theo từng món × số lượng.
      group.weightGram +=
        chargeableWeight(product.shipping ?? {}) * item.quantity;
      groups.set(key, group);
    }

    // Cước vận chuyển và trạng thái ban đầu chốt sau khi đã biết tổng tiền và
    // tổng khối lượng của từng gian hàng.
    const online = dto.paymentMethod === 'online';
    const expiresAt = online
      ? new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60_000)
      : undefined;

    const to = {
      provinceCode: dto.shippingAddress.provinceCode,
      wardCode: dto.shippingAddress.wardCode,
      lat: dto.shippingAddress.lat,
      lng: dto.shippingAddress.lng,
    };

    for (const group of groups.values()) {
      const pickup = group.shop.pickupAddress ?? {};
      group.shipping = this.shipping.quote({
        from: {
          provinceCode: pickup.provinceCode,
          wardCode: pickup.wardCode,
          lat: pickup.lat,
          lng: pickup.lng,
        },
        to,
        weightGram: group.weightGram,
        itemsTotal: group.itemsTotal,
      });
      group.shippingFee = group.shipping.fee;
      group.status = online ? 'pending_payment' : 'pending';
      group.paymentExpiresAt = expiresAt;
      // Đơn COD vào thẳng `pending` nên hạn xác nhận chốt ngay lúc đặt. Đơn
      // online chỉ tính hạn khi thật sự vào `pending` — tức đã thanh toán
      // xong, xem `PaymentService.applyPaid` — chờ ở `pending_payment` không
      // tính vào SLA của người bán.
      if (!online) {
        const now = Date.now();
        group.sellerActionDeadlineAt = new Date(
          now + ORDER_CONFIRM_HOURS * 3_600_000,
        );
        group.sellerActionWarnAt = new Date(
          now + ORDER_CONFIRM_WARN_HOURS * 3_600_000,
        );
      }
    }

    return {
      groups: [...groups.values()],
      stockItems: items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
      })),
    };
  }

  /* ---------------------------- Chuyển trạng thái ------------------------ */

  /**
   * Huỷ đơn và hoàn kho — an toàn khi bị gọi nhiều lần / nhiều nơi cùng lúc.
   *
   * 🔴 Mấu chốt: giành quyền huỷ bằng MỘT `updateOne` có điều kiện
   * `stockReleased: false`. Chỉ request nào thực sự đổi được bản ghi
   * (`modifiedCount === 1`) mới được hoàn kho. Người mua bấm huỷ đúng lúc job
   * quét đơn quá hạn chạy → chỉ một bên thắng, kho không bị cộng hai lần.
   *
   * Đặt cờ trước rồi mới hoàn kho: nếu tiến trình chết ở giữa, kho thiếu một
   * ít (khắc phục được bằng đối soát) — còn nếu hoàn trước mới đặt cờ thì rủi
   * ro là cộng khống tồn kho, tức bán thứ không có, tệ hơn nhiều.
   */
  private async cancelOrder(
    order: OrderDocument,
    by: 'buyer' | 'seller' | 'system',
    reason?: string,
    allowedFrom: readonly OrderStatus[] = [],
    reasonType?: CancelReason,
  ) {
    const res = await this.orderModel.updateOne(
      {
        _id: order._id,
        status: { $in: [...allowedFrom] },
        stockReleased: false,
      },
      {
        $set: {
          status: 'cancelled',
          stockReleased: true,
          cancelledBy: by,
          // `undefined` bị mongoose loại khỏi $set nên huỷ bởi seller/hệ thống
          // không ghi nhãn — đúng ý, chỉ người mua mới chọn nhãn.
          cancelReasonType: reasonType,
          cancelReason: reason,
        },
        $push: {
          timeline: { status: 'cancelled', at: new Date(), by, note: reason },
        },
      },
    );

    if (res.modifiedCount !== 1) {
      // Không giành được: đơn đã bị huỷ trước đó, hoặc đã qua giai đoạn huỷ được.
      const fresh = await this.orderModel.findById(order._id).select('status');
      throw new ConflictException(
        fresh?.status === 'cancelled'
          ? 'Đơn hàng này đã được huỷ trước đó.'
          : 'Đơn hàng đã chuyển sang giai đoạn không thể huỷ.',
      );
    }

    await this.products.releaseStock(this.stockItemsOf([order]));

    // 🔴 Đơn đã thu tiền mà bị huỷ thì kho được hoàn, đơn được đóng, nhưng
    // TIỀN vẫn nằm ở sàn. Không ghi lại thì khoản nợ đó biến mất khỏi mọi báo
    // cáo và người mua mất tiền trong im lặng.
    if (order.paidAt && order.payment) {
      await this.payments.flagRefundForOrder({
        paymentId: order.payment,
        orderCode: order.orderCode,
        amount: order.total,
        reason: reason?.trim() || `huỷ bởi ${by}`,
      });
    }

    return { ok: true };
  }

  /** Người mua tự huỷ đơn khi người bán chưa xác nhận. */
  async cancelByBuyer(
    user: UserDocument,
    id: string,
    reasonType?: CancelReason,
    reason?: string,
  ) {
    const order = await this.findOwnedByBuyer(user, id);
    if (!BUYER_CANCELLABLE.includes(order.status)) {
      throw new BadRequestException(
        order.status === 'cancelled'
          ? 'Đơn hàng này đã được huỷ.'
          : 'Người bán đã xác nhận đơn, vui lòng liên hệ gian hàng để huỷ.',
      );
    }
    const res = await this.cancelOrder(
      order,
      'buyer',
      reason,
      BUYER_CANCELLABLE,
      reasonType,
    );
    // Đơn `pending` (đã hiện với người bán) bị huỷ thì báo họ; `pending_payment`
    // thì người bán còn chưa thấy đơn, không cần làm phiền.
    if (order.status === 'pending') {
      await this.notifications.notifyShop(order.shop, {
        type: 'buyer_cancelled',
        title: 'Người mua đã huỷ đơn',
        body: `Đơn ${order.orderCode} vừa bị người mua huỷ.`,
        link: `/orders/${String(order._id)}`,
        data: { orderId: String(order._id), orderCode: order.orderCode },
      });
    }
    return res;
  }

  /* --------------------------- Sửa địa chỉ ------------------------------ */

  /**
   * Người mua sửa địa chỉ giao hàng.
   *
   * Phân tầng theo thứ mà việc sửa ĐỤNG VÀO, chứ không theo trạng thái đơn:
   *  - Tên, số điện thoại: không đổi cước, không đổi nơi hàng đến.
   *  - Số nhà/tên đường trong cùng phường: không đổi cước.
   *  - Phường/tỉnh: đổi vùng giao ⇒ ĐỔI CƯỚC. Đây là thứ đụng tiền.
   *
   * Vì thế:
   *  - Chưa xác nhận → sửa tất, cước tính lại.
   *  - Đã xác nhận (`confirmed`) → người bán đang đóng gói, có thể đã in nhãn.
   *    Khoá phường/tỉnh, chỉ cho sửa tên/SĐT/số nhà.
   *  - Đang giao trở đi → hàng ở tay hãng vận chuyển, hệ thống không còn quyền.
   *
   * 🔴 Đơn ĐÃ TRẢ TIỀN thì không được đổi tỉnh dù đang ở trạng thái nào: cước
   * mới khác cước đã thu, mà luồng thu thêm/hoàn lại thì chưa có. Thà chặn và
   * nói rõ còn hơn ghi một con số không khớp với tiền thật.
   */
  async updateShippingAddress(
    user: UserDocument,
    id: string,
    dto: UpdateShippingAddressDto,
  ) {
    const order = await this.findOwnedByBuyer(user, id);

    if (!ADDRESS_EDITABLE.includes(order.status)) {
      throw new BadRequestException(
        order.status === 'cancelled'
          ? 'Đơn hàng đã huỷ, không sửa được địa chỉ.'
          : order.status === 'delivered'
            ? 'Đơn hàng đã giao xong, không sửa được địa chỉ.'
            : 'Đơn đã bàn giao cho đơn vị vận chuyển nên không đổi được địa chỉ. Vui lòng liên hệ gian hàng.',
      );
    }

    const current = order.shippingAddress;
    const movedProvince =
      (dto.provinceCode ?? null) !== (current.provinceCode ?? null) ||
      dto.province.trim() !== current.province;
    const movedWard =
      (dto.wardCode ?? null) !== (current.wardCode ?? null) ||
      (dto.ward?.trim() ?? '') !== (current.ward ?? '');

    if (order.status === 'confirmed' && (movedProvince || movedWard)) {
      throw new BadRequestException(
        'Người bán đã xác nhận và đang chuẩn bị hàng nên chỉ đổi được tên, số điện thoại và số nhà. ' +
          'Muốn giao sang phường/tỉnh khác, vui lòng gửi yêu cầu huỷ đơn rồi đặt lại.',
      );
    }

    if (order.paidAt && movedProvince) {
      throw new BadRequestException(
        'Đơn đã thanh toán nên không đổi được sang tỉnh/thành khác vì cước vận chuyển sẽ khác. ' +
          'Bạn vẫn đổi được địa chỉ trong cùng tỉnh/thành.',
      );
    }

    // Cước chỉ đổi khi vùng giao đổi, mà vùng giao lại do tỉnh/toạ độ quyết
    // định — nên chỉ tính lại khi thực sự có thể khác.
    let shippingFee = order.shippingFee;
    if (movedProvince || movedWard) {
      shippingFee = await this.requoteShipping(order, dto);
    }

    order.shippingAddress = {
      ...current,
      label: dto.label?.trim() ?? current.label,
      recipientName: dto.recipientName.trim(),
      recipientPhone: dto.recipientPhone.trim(),
      street: dto.street.trim(),
      ward: dto.ward?.trim(),
      wardCode: dto.wardCode,
      district: dto.district?.trim(),
      province: dto.province.trim(),
      provinceCode: dto.provinceCode,
      lat: dto.lat,
      lng: dto.lng,
    };
    order.shippingFee = shippingFee;
    order.total = order.itemsTotal + shippingFee - order.discount;
    order.addressUpdatedAt = new Date();
    await order.save();

    return { order: this.toBuyerOrder(order, true) };
  }

  /** Cước cho địa chỉ mới, dùng đúng khối lượng đã chốt lúc đặt. */
  private async requoteShipping(
    order: OrderDocument,
    to: UpdateShippingAddressDto,
  ): Promise<number> {
    const shop = await this.shopModel.findById(order.shop);
    // Gian hàng bị xoá thì coi như không biết điểm gửi — biểu cước tự lùi về
    // mức liên tỉnh thay vì nổ, đơn đã đặt rồi vẫn phải giao được.
    const pickup: Partial<NonNullable<ShopDocument['pickupAddress']>> =
      shop?.pickupAddress ?? {};
    return this.shipping.quote({
      from: {
        provinceCode: pickup.provinceCode,
        wardCode: pickup.wardCode,
        lat: pickup.lat,
        lng: pickup.lng,
      },
      to: {
        provinceCode: to.provinceCode,
        wardCode: to.wardCode,
        lat: to.lat,
        lng: to.lng,
      },
      weightGram: order.weightGram,
      itemsTotal: order.itemsTotal,
    }).fee;
  }

  /* ------------------------- Yêu cầu huỷ đơn ---------------------------- */

  /**
   * Người mua xin huỷ sau khi người bán đã xác nhận.
   *
   * Không cho huỷ thẳng vì hàng có thể đã đóng gói; nhưng cũng không chặn cứng
   * — người mua đổi ý hay chuyển nhà mà không có đường ra thì chỉ còn cách từ
   * chối nhận hàng, tệ hơn cho cả hai bên.
   */
  async requestCancel(
    user: UserDocument,
    id: string,
    reasonType?: CancelReason,
    reason?: string,
  ) {
    const order = await this.findOwnedByBuyer(user, id);

    if (BUYER_CANCELLABLE.includes(order.status)) {
      throw new BadRequestException(
        'Đơn này bạn huỷ được ngay, không cần gửi yêu cầu.',
      );
    }
    if (order.status !== 'confirmed') {
      throw new BadRequestException(
        order.status === 'cancelled'
          ? 'Đơn hàng này đã được huỷ.'
          : 'Đơn đã bàn giao vận chuyển nên không huỷ được nữa.',
      );
    }
    if (order.cancelRequest?.status === 'pending') {
      throw new BadRequestException(
        'Bạn đã gửi yêu cầu huỷ, vui lòng chờ người bán phản hồi.',
      );
    }

    order.cancelRequest = {
      reasonType,
      reason: reason?.trim(),
      requestedAt: new Date(),
      status: 'pending',
    };
    await order.save();
    await this.notifications.notifyShop(order.shop, {
      type: 'cancel_requested',
      title: 'Người mua xin huỷ đơn',
      body: `Đơn ${order.orderCode} có yêu cầu huỷ đang chờ bạn duyệt.`,
      link: `/orders/${String(order._id)}`,
      data: { orderId: String(order._id), orderCode: order.orderCode },
    });
    return { ok: true, order: this.toBuyerOrder(order, true) };
  }

  /** Người bán duyệt hoặc từ chối yêu cầu huỷ. */
  async respondCancelRequest(
    user: UserDocument,
    id: string,
    approve: boolean,
    note?: string,
  ) {
    const shop = await this.requireShop(user);
    // Shop đang bị đình chỉ có động cơ từ chối để giữ tiền — xung đột lợi ích
    // trực tiếp. Admin xử lý thay (xem `adminRespondCancelRequest`).
    if (shop.status === 'suspended') {
      throw new ForbiddenException(
        'Gian hàng đang bị đình chỉ nên không thể tự xử lý yêu cầu huỷ — quản trị viên sẽ xem xét và quyết định thay.',
      );
    }
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }
    const order = await this.orderModel.findOne({ _id: id, shop: shop._id });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    return this.resolveCancelRequest(order, approve, note, 'seller');
  }

  /**
   * Admin xử lý yêu cầu huỷ THAY cho một gian hàng đang bị đình chỉ. Chỉ hoạt
   * động khi shop CÒN đang `suspended` — với shop bình thường, quyết định vẫn
   * thuộc về chính họ qua `respondCancelRequest`, admin không tự tiện can
   * thiệp vào quan hệ mua-bán khi không có lý do.
   */
  async adminRespondCancelRequest(
    admin: AdminPrincipal,
    id: string,
    approve: boolean,
    note?: string,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }
    const order = await this.orderModel.findById(id);
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    const shop = await this.shopModel
      .findById(order.shop)
      .select('status')
      .lean();
    if (!shop || shop.status !== 'suspended') {
      throw new BadRequestException(
        'Chỉ xử lý thay được yêu cầu của gian hàng đang bị đình chỉ.',
      );
    }
    this.logger.log(
      `Admin ${admin.id} xử lý yêu cầu huỷ đơn ${order.orderCode} thay gian hàng đang bị đình chỉ.`,
    );
    return this.resolveCancelRequest(order, approve, note, 'admin');
  }

  /** Logic chung cho duyệt/từ chối yêu cầu huỷ — dùng chung bởi seller và admin. */
  private async resolveCancelRequest(
    order: OrderDocument,
    approve: boolean,
    note: string | undefined,
    resolvedBy: 'seller' | 'admin',
  ) {
    if (order.cancelRequest?.status !== 'pending') {
      throw new BadRequestException('Đơn này không có yêu cầu huỷ đang chờ.');
    }
    const actorLabel =
      resolvedBy === 'admin'
        ? 'Quản trị viên (thay cho gian hàng đang bị đình chỉ)'
        : 'Người bán';

    if (!approve) {
      order.cancelRequest.status = 'rejected';
      order.cancelRequest.respondedAt = new Date();
      order.cancelRequest.sellerNote = note?.trim();
      order.markModified('cancelRequest');
      await order.save();
      await this.notifications.notifyUser(order.buyer, 'buyer', {
        type: 'cancel_rejected',
        title: 'Yêu cầu huỷ bị từ chối',
        body: `${actorLabel} không đồng ý huỷ đơn ${order.orderCode}.`,
        link: `/orders/${String(order._id)}`,
        data: { orderId: String(order._id), orderCode: order.orderCode },
      });
      return { ok: true, order: this.toSellerOrder(order, true) };
    }

    // Đánh dấu ĐÃ DUYỆT trước, rồi mới huỷ. `cancelOrder` giành quyền bằng
    // updateOne có điều kiện nên phải ghi phần này xong xuôi trước đó.
    order.cancelRequest.status = 'approved';
    order.cancelRequest.respondedAt = new Date();
    order.cancelRequest.sellerNote = note?.trim();
    order.markModified('cancelRequest');
    await order.save();

    const res = await this.cancelOrder(
      order,
      'buyer', // người mua mới là bên muốn huỷ; người duyệt chỉ chấp thuận
      order.cancelRequest.reason || 'Người mua yêu cầu huỷ',
      SELLER_CANCELLABLE,
    );
    await this.notifications.notifyUser(order.buyer, 'buyer', {
      type: 'cancel_approved',
      title: 'Đơn đã được huỷ',
      body: `${actorLabel} đã đồng ý huỷ đơn ${order.orderCode}.`,
      link: `/orders/${String(order._id)}`,
      data: { orderId: String(order._id), orderCode: order.orderCode },
    });
    return res;
  }

  /** Người bán từ chối / huỷ đơn (hết hàng, sai giá…). */
  async cancelBySeller(user: UserDocument, id: string, reason?: string) {
    const order = await this.findOwnedByShop(user, id);
    if (!SELLER_CANCELLABLE.includes(order.status)) {
      throw new BadRequestException(
        order.status === 'cancelled'
          ? 'Đơn hàng này đã được huỷ.'
          : 'Đơn đã bàn giao vận chuyển, không thể huỷ.',
      );
    }
    const res = await this.cancelOrder(
      order,
      'seller',
      reason,
      SELLER_CANCELLABLE,
    );
    await this.notifications.notifyUser(order.buyer, 'buyer', {
      type: 'order_cancelled_by_seller',
      title: 'Đơn hàng đã bị huỷ',
      body: `Người bán đã huỷ đơn ${order.orderCode}${reason?.trim() ? `: ${reason.trim()}` : '.'}`,
      link: `/orders/${String(order._id)}`,
      data: { orderId: String(order._id), orderCode: order.orderCode },
    });
    return res;
  }

  /**
   * Người bán đẩy đơn sang giai đoạn kế tiếp.
   *
   * Điều kiện `status: order.status` trong filter là một **khoá lạc quan**: mở
   * hai tab cùng bấm "Giao hàng" thì chỉ tab đầu đổi được, tab sau nhận lỗi rõ
   * ràng thay vì âm thầm nhảy cóc trạng thái.
   */
  async updateStatus(user: UserDocument, id: string, next: OrderStatus) {
    const order = await this.findOwnedByShop(user, id);

    /**
     * 🔴 Người bán KHÔNG được tự chốt "đã giao thành công".
     *
     * `delivered` đặt `deliveredAt`, mà `deliveredAt` là mốc bắt đầu đếm ngày
     * giữ tiền trước khi cho rút. Để người bán tự bấm nghĩa là họ tự mở khoá
     * tiền của chính mình mà người mua không có tiếng nói nào — chỉ cần bấm
     * bừa lúc hàng còn trên đường là lấy được tiền.
     *
     * Giờ chỉ có hai đường sang `delivered`: người mua xác nhận đã nhận, hoặc
     * hệ thống tự xác nhận sau `AUTO_CONFIRM_DAYS` ngày.
     */
    if (next === 'delivered') {
      throw new BadRequestException(
        'Đơn sẽ tự chuyển sang "Đã giao" khi người mua xác nhận đã nhận hàng, ' +
          `hoặc tự động sau ${AUTO_CONFIRM_DAYS} ngày kể từ lúc bàn giao vận chuyển. ` +
          'Nếu giao không thành công, hãy dùng "Giao hàng thất bại".',
      );
    }

    if (!ALLOWED_TRANSITIONS[order.status].includes(next)) {
      throw new BadRequestException(
        `Không thể chuyển đơn từ "${STATUS_LABEL[order.status]}" sang "${STATUS_LABEL[next]}".`,
      );
    }

    /**
     * Chuyển tiếp SLA xử lý sang khâu kế tiếp — hoặc dọn hẳn khi không còn
     * khâu nào chờ người bán chủ động làm:
     *  - `confirmed`: mở đồng hồ mới cho hạn BÀN GIAO VẬN CHUYỂN, đồng thời
     *    dọn cờ đã-nhắc của hạn XÁC NHẬN vừa qua để hạn mới có cờ sạch.
     *  - `shipping`: hàng đã rời tay người bán, không còn SLA nào của họ nữa.
     */
    const now = new Date();
    const slaFields: {
      sellerActionDeadlineAt: Date | null;
      sellerActionWarnAt: Date | null;
      sellerReminderSentAt: null;
    } | null =
      next === 'confirmed'
        ? {
            sellerActionDeadlineAt: new Date(
              now.getTime() + ORDER_SHIP_HOURS * 3_600_000,
            ),
            sellerActionWarnAt: new Date(
              now.getTime() + ORDER_SHIP_WARN_HOURS * 3_600_000,
            ),
            sellerReminderSentAt: null,
          }
        : next === 'shipping'
          ? {
              sellerActionDeadlineAt: null,
              sellerActionWarnAt: null,
              sellerReminderSentAt: null,
            }
          : null;

    const res = await this.orderModel.updateOne(
      { _id: order._id, status: order.status },
      {
        $set: { status: next, ...slaFields },
        $push: { timeline: { status: next, at: now, by: 'seller' } },
      },
    );
    if (res.modifiedCount !== 1) {
      throw new ConflictException(
        'Trạng thái đơn vừa thay đổi ở nơi khác. Vui lòng tải lại trang.',
      );
    }

    if (next === 'confirmed') {
      await this.notifications.notifyUser(order.buyer, 'buyer', {
        type: 'order_confirmed',
        title: 'Đơn hàng đã được xác nhận',
        body: `Người bán đã xác nhận đơn ${order.orderCode} và đang chuẩn bị hàng.`,
        link: `/orders/${String(order._id)}`,
        data: { orderId: String(order._id), orderCode: order.orderCode },
      });
    } else if (next === 'shipping') {
      await this.notifications.notifyUser(order.buyer, 'buyer', {
        type: 'order_shipping',
        title: 'Đơn hàng đang được giao',
        body: `Đơn ${order.orderCode} đã được bàn giao cho đơn vị vận chuyển.`,
        link: `/orders/${String(order._id)}`,
        data: { orderId: String(order._id), orderCode: order.orderCode },
      });
    }

    return { ok: true, status: next };
  }

  /* --------------------------- Nhận hàng -------------------------------- */

  /**
   * Chốt một đơn là đã giao thành công.
   *
   * Dùng chung cho hai đường vào (người mua xác nhận, hệ thống tự xác nhận) để
   * phần ghi sổ — mốc giao, cộng lượt bán — không có hai bản dễ trôi lệch.
   *
   * Giành quyền bằng `updateOne` có điều kiện `status: 'shipping'`: người mua
   * bấm đúng lúc job tự động chạy thì chỉ một bên ghi được, bên kia không cộng
   * lượt bán lần thứ hai.
   */
  private async markDelivered(
    order: OrderDocument,
    by: 'buyer' | 'system',
  ): Promise<boolean> {
    const now = new Date();
    const res = await this.orderModel.updateOne(
      { _id: order._id, status: 'shipping' },
      {
        $set: {
          status: 'delivered',
          // Mốc bắt đầu đếm ngày giữ tiền — phải là trường riêng chứ không
          // lục lại trong timeline.
          deliveredAt: now,
        },
        $push: {
          timeline: {
            status: 'delivered',
            at: now,
            by,
            note: by === 'system' ? 'Tự động xác nhận' : undefined,
          },
        },
      },
    );
    if (res.modifiedCount !== 1) return false;

    // Lượt bán chỉ cộng khi giao thành công — đơn huỷ không được tính.
    await this.products.recordSold(this.stockItemsOf([order]));

    if (by === 'buyer') {
      // Người mua xác nhận nhận hàng → tiền được mở khoá cho người bán.
      await this.notifications.notifyShop(order.shop, {
        type: 'order_received',
        title: 'Người mua đã nhận hàng',
        body: `Đơn ${order.orderCode} đã được xác nhận giao thành công.`,
        link: `/orders/${String(order._id)}`,
        data: { orderId: String(order._id), orderCode: order.orderCode },
      });
    } else {
      // Hệ thống tự xác nhận sau nhiều ngày — báo người mua biết.
      await this.notifications.notifyUser(order.buyer, 'buyer', {
        type: 'order_delivered_auto',
        title: 'Đơn hàng đã hoàn tất',
        body: `Đơn ${order.orderCode} được tự động xác nhận đã giao. Bạn có thể đánh giá sản phẩm.`,
        link: `/orders/${String(order._id)}`,
        data: { orderId: String(order._id), orderCode: order.orderCode },
      });
    }
    return true;
  }

  /** Người mua xác nhận đã nhận được hàng. */
  async confirmReceived(user: UserDocument, id: string) {
    const order = await this.findOwnedByBuyer(user, id);

    if (order.status === 'delivered') {
      throw new BadRequestException('Đơn hàng này đã được xác nhận trước đó.');
    }
    if (order.status !== 'shipping') {
      throw new BadRequestException(
        'Chỉ xác nhận được khi đơn đang trên đường giao tới bạn.',
      );
    }

    if (!(await this.markDelivered(order, 'buyer'))) {
      throw new ConflictException(
        'Trạng thái đơn vừa thay đổi. Vui lòng tải lại trang.',
      );
    }
    return { ok: true };
  }

  /**
   * Tự xác nhận các đơn đã giao lâu mà người mua không bấm gì.
   *
   * Không có job này thì đơn kẹt ở "Đang giao" vĩnh viễn — người bán không bao
   * giờ rút được tiền chỉ vì người mua quên bấm một nút, và đó là lỗi của hệ
   * thống chứ không phải của họ.
   */
  async autoConfirmDelivered(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - AUTO_CONFIRM_DAYS * 86_400_000);
    const stale = await this.orderModel
      .find({ status: 'shipping', updatedAt: { $lte: cutoff } })
      .limit(200);

    let done = 0;
    for (const order of stale) {
      if (await this.markDelivered(order, 'system')) done++;
    }
    if (done) this.logger.log(`Tự xác nhận ${done} đơn đã giao quá hạn.`);
    return done;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleAutoConfirm() {
    try {
      await this.autoConfirmDelivered();
    } catch (err: unknown) {
      this.logger.error(`Tự xác nhận đơn thất bại: ${String(err)}`);
    }
  }

  /**
   * Người bán đánh dấu giao hàng thất bại (khách không nhận, sai địa chỉ…).
   *
   * Trước đây `shipping` không có đường ra nào ngoài `delivered`: hàng bị trả
   * về là đơn kẹt ở "Đang giao" mãi mãi, kho không bao giờ được hoàn và tiền
   * của người mua cũng không ai trả lại.
   */
  async markDeliveryFailed(user: UserDocument, id: string, reason?: string) {
    const order = await this.findOwnedByShop(user, id);
    if (order.status !== 'shipping') {
      throw new BadRequestException(
        'Chỉ đánh dấu được khi đơn đang trên đường giao.',
      );
    }
    const res = await this.cancelOrder(
      order,
      'seller',
      reason?.trim() || 'Giao hàng không thành công',
      ['shipping'],
    );
    await this.notifications.notifyUser(order.buyer, 'buyer', {
      type: 'delivery_failed',
      title: 'Giao hàng không thành công',
      body: `Đơn ${order.orderCode} giao không thành công và đã được huỷ${order.paidAt ? ', tiền sẽ được hoàn lại' : ''}.`,
      link: `/orders/${String(order._id)}`,
      data: { orderId: String(order._id), orderCode: order.orderCode },
    });
    return res;
  }

  /* ---------------------------- Trả hàng -------------------------------- */

  /** Hạn cuối được yêu cầu trả hàng, hoặc null nếu đơn chưa giao xong. */
  private returnDeadline(order: OrderDocument): Date | null {
    if (!order.deliveredAt) return null;
    return new Date(
      order.deliveredAt.getTime() + RETURN_WINDOW_DAYS * 86_400_000,
    );
  }

  /** Người mua còn được mở yêu cầu trả hàng cho đơn này không. */
  private canRequestReturn(order: OrderDocument, now = new Date()): boolean {
    if (order.status !== 'delivered') return false;
    const deadline = this.returnDeadline(order);
    if (!deadline || now > deadline) return false;
    // Đang có yêu cầu chờ xử lý thì không mở thêm; bị từ chối thì cho gửi lại
    // (trong thời hạn) vì có thể bổ sung được bằng chứng.
    return order.returnRequest?.status !== 'requested';
  }

  /**
   * Người mua yêu cầu trả hàng sau khi đã nhận.
   *
   * Chỉ mở trong `RETURN_WINDOW_DAYS` ngày kể từ lúc giao — quá đó thì hàng đã
   * dùng lâu, không còn căn cứ để trả. Việc DUYỆT thuộc về người bán; ở đây chỉ
   * ghi nhận yêu cầu, chưa đụng tới kho hay tiền.
   */
  async requestReturn(user: UserDocument, id: string, dto: RequestReturnDto) {
    const order = await this.findOwnedByBuyer(user, id);

    if (order.status === 'returned') {
      throw new BadRequestException('Đơn hàng này đã được trả.');
    }
    if (order.status !== 'delivered') {
      throw new BadRequestException(
        'Chỉ trả hàng được với đơn đã giao thành công.',
      );
    }
    if (order.returnRequest?.status === 'requested') {
      throw new BadRequestException(
        'Bạn đã gửi yêu cầu trả hàng, vui lòng chờ người bán phản hồi.',
      );
    }
    const deadline = this.returnDeadline(order);
    if (!deadline || new Date() > deadline) {
      throw new BadRequestException(
        `Đã quá hạn trả hàng (${RETURN_WINDOW_DAYS} ngày kể từ khi nhận hàng).`,
      );
    }

    order.returnRequest = {
      reasonType: dto.reasonType,
      reason: dto.reason?.trim(),
      requestedAt: new Date(),
      status: 'requested',
    };
    order.markModified('returnRequest');
    await order.save();
    await this.notifications.notifyShop(order.shop, {
      type: 'return_requested',
      title: 'Người mua yêu cầu trả hàng',
      body: `Đơn ${order.orderCode} có yêu cầu trả hàng đang chờ bạn duyệt.`,
      link: `/orders/${String(order._id)}`,
      data: { orderId: String(order._id), orderCode: order.orderCode },
    });
    return { ok: true, order: this.toBuyerOrder(order, true) };
  }

  /**
   * Người bán duyệt hoặc từ chối yêu cầu trả hàng.
   *
   * Duyệt = chấp nhận trả và HOÀN TIỀN cho người mua: đơn sang `returned`, trừ
   * lượt bán, ghi nghĩa vụ hoàn tiền. KHÔNG tự cộng lại tồn kho — hàng trả về
   * có thể đã hư/đã dùng, người bán kiểm rồi tự chỉnh kho.
   */
  async respondReturn(
    user: UserDocument,
    id: string,
    approve: boolean,
    note?: string,
  ) {
    const shop = await this.requireShop(user);
    if (shop.status === 'suspended') {
      throw new ForbiddenException(
        'Gian hàng đang bị đình chỉ nên không thể tự xử lý yêu cầu trả hàng — quản trị viên sẽ xem xét và quyết định thay.',
      );
    }
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }
    const order = await this.orderModel.findOne({ _id: id, shop: shop._id });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    return this.resolveReturnRequest(order, approve, note, 'seller');
  }

  /** Admin xử lý yêu cầu trả hàng THAY cho một gian hàng đang bị đình chỉ — xem `adminRespondCancelRequest`. */
  async adminRespondReturn(
    admin: AdminPrincipal,
    id: string,
    approve: boolean,
    note?: string,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }
    const order = await this.orderModel.findById(id);
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    const shop = await this.shopModel
      .findById(order.shop)
      .select('status')
      .lean();
    if (!shop || shop.status !== 'suspended') {
      throw new BadRequestException(
        'Chỉ xử lý thay được yêu cầu của gian hàng đang bị đình chỉ.',
      );
    }
    this.logger.log(
      `Admin ${admin.id} xử lý yêu cầu trả hàng đơn ${order.orderCode} thay gian hàng đang bị đình chỉ.`,
    );
    return this.resolveReturnRequest(order, approve, note, 'admin');
  }

  /**
   * Logic chung cho duyệt/từ chối yêu cầu trả hàng — dùng chung bởi seller và
   * admin. Duyệt = chấp nhận trả và HOÀN TIỀN cho người mua: đơn sang
   * `returned`, trừ lượt bán, ghi nghĩa vụ hoàn tiền. KHÔNG tự cộng lại tồn
   * kho — hàng trả về có thể đã hư/đã dùng, người kiểm rồi tự chỉnh kho.
   */
  private async resolveReturnRequest(
    order: OrderDocument,
    approve: boolean,
    note: string | undefined,
    resolvedBy: 'seller' | 'admin',
  ) {
    if (order.returnRequest?.status !== 'requested') {
      throw new BadRequestException(
        'Đơn này không có yêu cầu trả hàng đang chờ.',
      );
    }
    const actorLabel =
      resolvedBy === 'admin'
        ? 'Quản trị viên (thay cho gian hàng đang bị đình chỉ)'
        : 'Người bán';

    if (!approve) {
      order.returnRequest.status = 'rejected';
      order.returnRequest.respondedAt = new Date();
      order.returnRequest.sellerNote = note?.trim();
      order.markModified('returnRequest');
      await order.save();
      await this.notifications.notifyUser(order.buyer, 'buyer', {
        type: 'return_rejected',
        title: 'Yêu cầu trả hàng bị từ chối',
        body: `${actorLabel} không đồng ý trả hàng cho đơn ${order.orderCode}.`,
        link: `/orders/${String(order._id)}`,
        data: { orderId: String(order._id), orderCode: order.orderCode },
      });
      return { ok: true, order: this.toSellerOrder(order, true) };
    }

    // 🔴 Giành quyền bằng `updateOne` có điều kiện `status: 'delivered'`. Đơn
    // chỉ chuyển sang `returned` được đúng một lần, kể cả khi có hai request
    // duyệt song song — chỉ bên đổi được bản ghi mới trừ lượt bán và ghi nợ.
    const now = new Date();
    const res = await this.orderModel.updateOne(
      { _id: order._id, status: 'delivered' },
      {
        $set: {
          status: 'returned',
          returnedAt: now,
          'returnRequest.status': 'approved',
          'returnRequest.respondedAt': now,
          'returnRequest.sellerNote': note?.trim(),
          buyerRefundPending: true,
          buyerRefundAmount: order.total,
        },
        $push: {
          timeline: {
            status: 'returned',
            at: now,
            by: resolvedBy,
            note:
              note?.trim() ||
              (resolvedBy === 'admin'
                ? 'Quản trị viên đồng ý trả hàng'
                : 'Đồng ý trả hàng'),
          },
        },
      },
    );
    if (res.modifiedCount !== 1) {
      throw new ConflictException(
        'Trạng thái đơn vừa thay đổi ở nơi khác. Vui lòng tải lại trang.',
      );
    }

    // Trừ lượt bán (đối xứng với lúc giao). Không chặn luồng nếu lỗi — đơn đã
    // sang `returned`, thống kê lệch một chút sửa được, còn ném lỗi ở đây thì
    // người bán tưởng duyệt hỏng và bấm lại.
    await this.products.releaseSold(this.stockItemsOf([order]));

    // Đơn online đã trả tiền: đẩy vào hàng đợi hoàn tiền của cổng. Đơn COD chỉ
    // có cờ `buyerRefundPending` trên đơn (không có bản ghi Payment) — người
    // vận hành đọc cờ đó để hoàn tiền mặt cho khách.
    if (order.paidAt && order.payment) {
      await this.payments.flagRefundForOrder({
        paymentId: order.payment,
        orderCode: order.orderCode,
        amount: order.total,
        reason: `Trả hàng (${order.returnRequest.reasonType})`,
      });
    } else {
      this.logger.warn(
        `Đơn COD ${order.orderCode} đã trả hàng — cần hoàn ${order.total}đ tiền mặt cho người mua.`,
      );
    }

    await this.notifications.notifyUser(order.buyer, 'buyer', {
      type: 'return_approved',
      title: 'Yêu cầu trả hàng được chấp nhận',
      body: `${actorLabel} đồng ý trả hàng đơn ${order.orderCode}. Tiền ${order.total.toLocaleString('vi-VN')}đ sẽ được hoàn cho bạn.`,
      link: `/orders/${String(order._id)}`,
      data: { orderId: String(order._id), orderCode: order.orderCode },
    });

    const fresh = await this.orderModel.findById(order._id);
    return { ok: true, order: this.toSellerOrder(fresh!, true) };
  }

  /**
   * Danh sách yêu cầu huỷ/trả hàng đang chờ của các gian hàng ĐANG BỊ ĐÌNH CHỈ
   * — hàng đợi admin xử lý thay. Quét theo shop suspended trước (thường rất
   * ít) rồi mới tìm đơn, thay vì quét toàn bộ đơn có yêu cầu chờ rồi lọc —
   * rẻ hơn nhiều ở quy mô lớn.
   */
  async adminListDisputes(): Promise<OrderDisputeItem[]> {
    const suspendedShops = await this.shopModel
      .find({ status: 'suspended' })
      .select('_id name')
      .lean();
    if (suspendedShops.length === 0) return [];
    const shopIds = suspendedShops.map((s) => s._id);
    const shopNameById = new Map(
      suspendedShops.map((s) => [String(s._id), s.name]),
    );

    const orders = await this.orderModel
      .find({
        shop: { $in: shopIds },
        $or: [
          { 'cancelRequest.status': 'pending' },
          { 'returnRequest.status': 'requested' },
        ],
      })
      .populate<{
        buyer: { _id: Types.ObjectId; email?: string; phone?: string };
      }>('buyer', 'email phone')
      .lean();

    const items: OrderDisputeItem[] = [];
    for (const o of orders) {
      const shopId = String(o.shop);
      const shopName = shopNameById.get(shopId) ?? '(Gian hàng đã xoá)';
      const buyerContact = o.buyer?.email || o.buyer?.phone || '(ẩn danh)';
      if (o.cancelRequest?.status === 'pending') {
        items.push({
          orderId: String(o._id),
          orderCode: o.orderCode,
          shopId,
          shopName,
          type: 'cancel',
          reasonType: o.cancelRequest.reasonType,
          reason: o.cancelRequest.reason,
          requestedAt: o.cancelRequest.requestedAt,
          buyerContact,
          total: o.total,
        });
      }
      if (o.returnRequest?.status === 'requested') {
        items.push({
          orderId: String(o._id),
          orderCode: o.orderCode,
          shopId,
          shopName,
          type: 'return',
          reasonType: o.returnRequest.reasonType,
          reason: o.returnRequest.reason,
          requestedAt: o.returnRequest.requestedAt,
          buyerContact,
          total: o.total,
        });
      }
    }
    return items.sort(
      (a, b) => a.requestedAt.getTime() - b.requestedAt.getTime(),
    );
  }

  /**
   * Bắt đầu / tiếp tục thanh toán — trả về link của cổng.
   *
   * Việc chốt "đã trả tiền" KHÔNG nằm ở đây mà ở webhook của cổng: client tự
   * nói mình đã trả thì ai cũng đặt hàng miễn phí được.
   */
  startPayment(user: UserDocument, id: string) {
    return this.payments.startPayment(user, id);
  }

  /* ------------------------------ Truy vấn ------------------------------- */

  private async findOwnedByBuyer(user: UserDocument, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }
    const order = await this.orderModel.findOne({ _id: id, buyer: user._id });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    return order;
  }

  private async findOwnedByShop(user: UserDocument, id: string) {
    const shop = await this.requireShop(user);
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }
    const order = await this.orderModel.findOne({ _id: id, shop: shop._id });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    return order;
  }

  /** Danh sách đơn của người mua. */
  async listMine(user: UserDocument, query: QueryOrdersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const filter = {
      buyer: user._id,
      ...(query.status ? { status: query.status as OrderStatus } : {}),
    };

    const [orders, total, counts] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.orderModel.countDocuments(filter),
      this.countByStatus({ buyer: user._id }),
    ]);

    return {
      items: orders.map((o) => this.toBuyerOrder(o)),
      total,
      page,
      limit,
      counts,
    };
  }

  async getMine(user: UserDocument, id: string) {
    const order = await this.findOwnedByBuyer(user, id);
    return { order: this.toBuyerOrder(order, true) };
  }

  /** Danh sách đơn của gian hàng đang đăng nhập. */
  async listForShop(user: UserDocument, query: QueryOrdersDto) {
    const shop = await this.requireShop(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const term = query.q?.trim();
    const search = term
      ? {
          $or: [
            { orderCode: { $regex: escapeRegex(term), $options: 'i' } },
            {
              'shippingAddress.recipientName': {
                $regex: escapeRegex(term),
                $options: 'i',
              },
            },
            {
              'shippingAddress.recipientPhone': {
                $regex: escapeRegex(term),
                $options: 'i',
              },
            },
          ],
        }
      : {};

    const filter = {
      shop: shop._id,
      ...(query.status ? { status: query.status as OrderStatus } : {}),
      ...search,
    };

    const [orders, total, counts] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.orderModel.countDocuments(filter),
      this.countByStatus({ shop: shop._id }),
    ]);

    return {
      items: orders.map((o) => this.toSellerOrder(o)),
      total,
      page,
      limit,
      counts,
    };
  }

  /**
   * Số liệu cho trang Tổng quan của người bán.
   *
   * Trước đây trang này hiển thị `0` cứng trong code — người bán đã có đơn thật
   * mà nhìn vào vẫn tưởng chưa bán được gì.
   *
   * Doanh thu chỉ tính đơn **đã giao thành công**: đơn đang chạy có thể bị huỷ,
   * đếm sớm là báo cho người bán một con số sẽ tụt xuống sau đó.
   */
  async shopStats(user: UserDocument) {
    const shop = await this.requireShop(user);
    const since = new Date(Date.now() - 30 * 86_400_000);

    const [counts, revenue, recent, topProducts] = await Promise.all([
      this.countByStatus({ shop: shop._id }),
      this.orderModel.aggregate<{ _id: null; total: number; orders: number }>([
        { $match: { shop: shop._id, status: 'delivered' } },
        {
          $group: {
            _id: null,
            total: { $sum: '$itemsTotal' },
            orders: { $sum: 1 },
          },
        },
      ]),
      this.orderModel.find({ shop: shop._id }).sort({ createdAt: -1 }).limit(5),
      // Bán chạy trong 30 ngày — mở từng dòng hàng ra rồi gom theo sản phẩm.
      this.orderModel.aggregate<{
        _id: Types.ObjectId;
        name: string;
        image?: string;
        quantity: number;
        revenue: number;
      }>([
        {
          $match: {
            shop: shop._id,
            status: 'delivered',
            deliveredAt: { $gte: since },
          },
        },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            name: { $first: '$items.name' },
            image: { $first: '$items.image' },
            quantity: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.subtotal' },
          },
        },
        { $sort: { quantity: -1 } },
        { $limit: 5 },
      ]),
    ]);

    return {
      counts,
      revenue: {
        /** Tổng tiền hàng từ các đơn đã giao (chưa trừ hoa hồng). */
        total: revenue[0]?.total ?? 0,
        deliveredOrders: revenue[0]?.orders ?? 0,
      },
      /** Việc cần làm ngay — con số người bán quan tâm nhất khi mở dashboard. */
      todo: {
        pending: counts.pending ?? 0,
        confirmed: counts.confirmed ?? 0,
        shipping: counts.shipping ?? 0,
      },
      recentOrders: recent.map((o) => this.toSellerOrder(o)),
      topProducts: topProducts.map((p) => ({
        productId: String(p._id),
        name: p.name,
        image: p.image,
        quantity: p.quantity,
        revenue: p.revenue,
      })),
    };
  }

  async getForShop(user: UserDocument, id: string) {
    const order = await this.findOwnedByShop(user, id);
    return { order: this.toSellerOrder(order, true) };
  }

  /** Số đơn theo từng trạng thái — cho badge trên thanh tab. */
  private async countByStatus(match: Record<string, unknown>) {
    const rows = await this.orderModel.aggregate<{
      _id: OrderStatus;
      n: number;
    }>([{ $match: match }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
    const counts: Record<string, number> = { all: 0 };
    for (const r of rows) {
      counts[r._id] = r.n;
      counts.all += r.n;
    }
    return counts;
  }

  /* ------------------------------ Trình bày ------------------------------ */

  private baseOrder(o: OrderDocument) {
    return {
      id: String(o._id),
      orderCode: o.orderCode,
      status: o.status,
      statusLabel: STATUS_LABEL[o.status],
      items: o.items.map((i) => ({
        productId: String(i.product),
        variantId: String(i.variant),
        productSlug: i.productSlug,
        name: i.name,
        image: i.image,
        variantLabel: i.variantLabel,
        sku: i.sku,
        price: i.price,
        originalPrice: i.originalPrice,
        quantity: i.quantity,
        subtotal: i.subtotal,
      })),
      itemsTotal: o.itemsTotal,
      shippingFee: o.shippingFee,
      discount: o.discount,
      total: o.total,
      paymentMethod: o.paymentMethod,
      paymentExpiresAt: o.paymentExpiresAt,
      paidAt: o.paidAt,
      /**
       * Hạn xử lý hiện tại của người bán — `pending` là hạn xác nhận,
       * `confirmed` là hạn bàn giao vận chuyển; `null`/`undefined` ở các
       * trạng thái khác. Cả buyer lẫn seller đều cần thấy: buyer để biết khi
       * nào đơn tự huỷ nếu shop im lặng, seller để biết mình còn bao lâu.
       */
      sellerActionDeadlineAt: o.sellerActionDeadlineAt,
      note: o.note,
      cancelledBy: o.cancelledBy,
      cancelReasonType: o.cancelReasonType,
      cancelReason: o.cancelReason,
      createdAt: (o as unknown as { createdAt: Date }).createdAt,
    };
  }

  private toBuyerOrder(o: OrderDocument, full = false) {
    return {
      ...this.baseOrder(o),
      // `id` để người mua bấm "Nhắn tin cho shop" ngay từ đơn hàng.
      shop: { id: String(o.shop), name: o.shopName, slug: o.shopSlug },
      canCancel: BUYER_CANCELLABLE.includes(o.status),
      /**
       * Giao diện đọc ba cờ này thay vì tự suy từ trạng thái — quy tắc nằm ở
       * MỘT nơi, và cái nút hiện ra luôn khớp với cái backend chấp nhận.
       */
      canEditAddress: ADDRESS_EDITABLE.includes(o.status),
      // Đã xác nhận hoặc đã trả tiền thì chỉ sửa được trong cùng tỉnh/thành.
      addressLocked: o.status === 'confirmed' || !!o.paidAt,
      canRequestCancel:
        o.status === 'confirmed' && o.cancelRequest?.status !== 'pending',
      /** Xác nhận đã nhận hàng — đây là thứ mở khoá tiền cho người bán. */
      canConfirmReceived: o.status === 'shipping',
      cancelRequest: o.cancelRequest,
      /** Trả hàng — chỉ mở trong cửa sổ sau khi giao (xem `canRequestReturn`). */
      canRequestReturn: this.canRequestReturn(o),
      returnRequest: o.returnRequest,
      returnWindowDays: RETURN_WINDOW_DAYS,
      returnableUntil: this.returnDeadline(o)?.toISOString(),
      ...(full
        ? { shippingAddress: o.shippingAddress, timeline: o.timeline }
        : {}),
    };
  }

  private toSellerOrder(o: OrderDocument, full = false) {
    return {
      ...this.baseOrder(o),
      // Người bán cần thông tin giao hàng ngay ở danh sách để chuẩn bị đóng gói.
      shippingAddress: o.shippingAddress,
      // `buyerId` để bấm "Nhắn tin cho khách" ngay từ đơn hàng.
      buyerId: String(o.buyer),
      // Bỏ `delivered`: người bán không tự chốt được nữa, phải chờ người mua
      // xác nhận hoặc hệ thống tự xác nhận sau ít ngày. Bỏ `cancelled` vì huỷ
      // đi đường riêng, không phải một "bước tiếp theo".
      nextStatus: ALLOWED_TRANSITIONS[o.status].filter(
        (s) => s !== 'cancelled' && s !== 'delivered',
      ),
      canCancel: SELLER_CANCELLABLE.includes(o.status),
      /** Giao thất bại — đường ra duy nhất cho đơn đang giao mà hàng bị trả về. */
      canMarkFailed: o.status === 'shipping',
      autoConfirmDays: AUTO_CONFIRM_DAYS,
      // Người bán phải thấy hai thứ này ngay ở DANH SÁCH: địa chỉ sửa sau khi
      // đã in nhãn thì phải in lại, còn yêu cầu huỷ để treo là người mua chờ.
      addressUpdatedAt: o.addressUpdatedAt,
      cancelRequest: o.cancelRequest,
      returnRequest: o.returnRequest,
      /** Có yêu cầu trả hàng đang chờ người bán duyệt. */
      canRespondReturn: o.returnRequest?.status === 'requested',
      buyerRefundPending: o.buyerRefundPending,
      ...(full ? { timeline: o.timeline } : {}),
    };
  }

  /* --------------------------- Dọn đơn quá hạn --------------------------- */

  /**
   * Huỷ các đơn chờ thanh toán đã quá hạn và trả kho về.
   *
   * Không có job này thì một người bấm đặt hàng rồi bỏ đi sẽ giam hàng vĩnh
   * viễn, người mua khác nhìn thấy "hết hàng" trong khi kho thực tế còn.
   * Chạy trong tiến trình bằng cron — không cần Redis.
   */
  async expireUnpaidOrders(now = new Date()): Promise<number> {
    // 🔴 Chờ thêm một khoảng ân hạn sau hạn hiển thị cho người mua. Ai bấm trả
    // tiền ở giây cuối thì webhook còn đang trên đường; huỷ ngay lúc đó là vừa
    // thu tiền vừa huỷ đơn — tình huống tệ nhất của cả hệ thống.
    const cutoff = new Date(now.getTime() - PAYMENT_GRACE_MINUTES * 60_000);
    const expired = await this.orderModel
      .find({ status: 'pending_payment', paymentExpiresAt: { $lte: cutoff } })
      .limit(200);

    let cancelled = 0;
    for (const order of expired) {
      try {
        await this.cancelOrder(order, 'system', 'Quá hạn thanh toán', [
          'pending_payment',
        ]);
        cancelled++;
      } catch {
        // Người mua vừa thanh toán/huỷ trước một nhịp — bỏ qua, không phải lỗi.
      }
    }
    if (cancelled) {
      this.logger.log(
        `Đã huỷ ${cancelled} đơn quá hạn thanh toán và hoàn kho.`,
      );
    }
    return cancelled;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredOrders() {
    await this.expireUnpaidOrders().catch((e: unknown) =>
      this.logger.error(`Lỗi khi dọn đơn quá hạn: ${String(e)}`),
    );
  }

  /* ------------------- Nhắc & tự huỷ đơn người bán bỏ quên ---------------- */

  /**
   * Nhãn khâu hiện tại của đơn — dùng chung cho cả thông báo nhắc lẫn lý do
   * huỷ, để hai chỗ không lệch chữ nhau.
   */
  private staleStageLabel(status: OrderStatus): string {
    return status === 'pending' ? 'xác nhận đơn' : 'bàn giao vận chuyển';
  }

  /**
   * Bước 1/2 — nhắc người bán khi đơn sắp quá hạn xử lý (xác nhận hoặc bàn
   * giao vận chuyển, tuỳ trạng thái) mà chưa được nhắc lần nào cho hạn hiện
   * tại.
   *
   * Tách hẳn khỏi bước huỷ và giành quyền bằng `updateOne` điều kiện
   * `sellerReminderSentAt: null` — cùng khoá lạc quan như `cancelOrder` — để
   * job chạy nhiều lần chồng nhau (chạy chậm hơn chu kỳ cron) không gửi
   * trùng một lời nhắc nhiều lần.
   */
  async warnStaleSellerOrders(now = new Date()): Promise<number> {
    const due = await this.orderModel
      .find({
        status: { $in: ['pending', 'confirmed'] },
        sellerActionWarnAt: { $lte: now },
        sellerReminderSentAt: null,
      })
      .limit(200);

    let warned = 0;
    for (const order of due) {
      const res = await this.orderModel.updateOne(
        { _id: order._id, sellerReminderSentAt: null },
        { $set: { sellerReminderSentAt: now } },
      );
      if (res.modifiedCount !== 1) continue; // đã được nhắc bởi lượt chạy khác

      const stage = this.staleStageLabel(order.status);
      const deadlineText = order.sellerActionDeadlineAt
        ? new Date(order.sellerActionDeadlineAt).toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
          })
        : '';
      await this.notifications.notifyShop(order.shop, {
        type:
          order.status === 'pending'
            ? 'order_confirm_reminder'
            : 'order_ship_reminder',
        title: `Đơn ${order.orderCode} sắp quá hạn ${stage}`,
        body: `Vui lòng ${stage} trước ${deadlineText}. Quá hạn mà chưa xử lý, đơn sẽ tự động bị huỷ và hoàn tiền cho khách.`,
        link: `/orders/${String(order._id)}`,
        data: { orderId: String(order._id), orderCode: order.orderCode },
      });
      warned++;
    }
    if (warned) this.logger.log(`Đã nhắc ${warned} đơn sắp quá hạn xử lý.`);
    return warned;
  }

  /**
   * Bước 2/2 — tự huỷ đơn ĐÃ QUA hạn xử lý mà người bán vẫn không làm gì.
   * Đơn đã được nhắc ở bước 1 trước khi tới được đây (hạn nhắc luôn sớm hơn
   * hạn huỷ — xem `config.order`), nên đây không phải một cú cắt bất ngờ.
   *
   * Dùng lại `cancelOrder` — hoàn kho, đánh dấu hoàn tiền nếu đã trả online —
   * y hệt mọi đường huỷ khác, chỉ khác người khởi xướng (`system`) và lý do.
   */
  async cancelStaleSellerOrders(now = new Date()): Promise<number> {
    const stale = await this.orderModel
      .find({
        status: { $in: ['pending', 'confirmed'] },
        sellerActionDeadlineAt: { $lte: now },
      })
      .limit(200);

    let cancelled = 0;
    for (const order of stale) {
      const stage = this.staleStageLabel(order.status);
      try {
        await this.cancelOrder(
          order,
          'system',
          `Người bán không ${stage} trong thời hạn quy định`,
          [order.status],
        );
      } catch {
        continue; // đã bị xử lý ở nơi khác giữa lúc quét (huỷ tay, bàn giao…)
      }

      await this.notifications.notifyUser(order.buyer, 'buyer', {
        type: 'order_auto_cancelled',
        title: 'Đơn hàng đã được tự động huỷ',
        body: `Gian hàng không phản hồi đơn ${order.orderCode} trong thời hạn quy định nên đơn đã được huỷ${order.paidAt ? ', tiền sẽ được hoàn lại' : ''}.`,
        link: `/orders/${String(order._id)}`,
        data: { orderId: String(order._id), orderCode: order.orderCode },
      });
      await this.notifications.notifyShop(order.shop, {
        type: 'order_auto_cancelled_seller',
        title: 'Đơn hàng đã bị tự động huỷ',
        body: `Đơn ${order.orderCode} đã tự động huỷ do quá hạn ${stage}. Vui lòng xử lý đơn sớm hơn để tránh mất đơn hàng trong tương lai.`,
        link: `/orders/${String(order._id)}`,
        data: { orderId: String(order._id), orderCode: order.orderCode },
      });
      cancelled++;
    }
    if (cancelled) {
      this.logger.log(
        `Đã tự huỷ ${cancelled} đơn quá hạn xử lý của người bán.`,
      );
    }
    return cancelled;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleStaleSellerOrders() {
    try {
      await this.warnStaleSellerOrders();
      await this.cancelStaleSellerOrders();
    } catch (err: unknown) {
      this.logger.error(`Lỗi khi xử lý đơn treo ở người bán: ${String(err)}`);
    }
  }
}

/** Nhãn tiếng Việt của trạng thái — dùng chung cho thông báo lỗi và hiển thị. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Chờ thanh toán',
  pending: 'Chờ xác nhận',
  confirmed: 'Chờ lấy hàng',
  shipping: 'Đang giao',
  delivered: 'Đã giao',
  cancelled: 'Đã huỷ',
  returned: 'Đã trả hàng',
};

/** Chặn ký tự đặc biệt của regex trong từ khoá tìm kiếm do người dùng nhập. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
