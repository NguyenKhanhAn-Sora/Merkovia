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
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { shortId } from '../common/text';
import type { UserDocument } from '../users/schemas/user.schema';

/** Thời gian giữ kho cho đơn chờ thanh toán online. */
const PAYMENT_WINDOW_MINUTES = 15;

/** Người mua chỉ được huỷ khi người bán chưa bắt đầu chuẩn bị hàng. */
const BUYER_CANCELLABLE: readonly OrderStatus[] = ['pending_payment', 'pending'];
/** Người bán được từ chối đơn cho tới trước khi bàn giao vận chuyển. */
const SELLER_CANCELLABLE: readonly OrderStatus[] = ['pending', 'confirmed'];

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
  ) {}

  /* ------------------------------ Tiện ích ------------------------------- */

  /** Mã đơn cho người dùng đọc — kèm mốc thời gian nên gần như không đụng nhau. */
  private newOrderCode(): string {
    return `MK${Date.now().toString(36)}${shortId()}`.toUpperCase();
  }

  /** Chỉ giữ khuyến mãi còn hiệu lực VÀ thực sự rẻ hơn giá niêm yết. */
  private dealPrice(product: ProductDocument, listPrice: number): number {
    const deal = product.activeDeal;
    if (!deal || new Date(deal.endsAt).getTime() <= Date.now()) return listPrice;
    return deal.price < listPrice ? deal.price : listPrice;
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
  async quote(user: UserDocument, dto: CreateOrderDto) {
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
          discount: 0,
          total: group.itemsTotal + group.shippingFee,
          status: group.status,
          paymentMethod: dto.paymentMethod as PaymentMethod,
          paymentExpiresAt: group.paymentExpiresAt,
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

    // Đơn online cần một phiên thanh toán cho CẢ nhóm — người mua trả một lần
    // cho toàn giỏ, không phải trả riêng từng gian hàng.
    let payment: ReturnType<PaymentService['publicPayment']> | null = null;
    if (dto.paymentMethod === 'online') {
      const doc = await this.payments.createForCheckout({
        buyer: user._id as Types.ObjectId,
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
  private async buildGroups(user: UserDocument, dto: CreateOrderDto) {
    // Gộp dòng trùng (cùng sản phẩm + cùng phân loại) để không giữ kho hai lần
    // cho một món — client có thể gửi lên hai dòng giống nhau.
    const merged = new Map<string, { productId: string; variantId: string; quantity: number }>();
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
    return { ok: true };
  }

  /** Người mua tự huỷ đơn khi người bán chưa xác nhận. */
  async cancelByBuyer(user: UserDocument, id: string, reason?: string) {
    const order = await this.findOwnedByBuyer(user, id);
    if (!BUYER_CANCELLABLE.includes(order.status)) {
      throw new BadRequestException(
        order.status === 'cancelled'
          ? 'Đơn hàng này đã được huỷ.'
          : 'Người bán đã xác nhận đơn, vui lòng liên hệ gian hàng để huỷ.',
      );
    }
    return this.cancelOrder(order, 'buyer', reason, BUYER_CANCELLABLE);
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
    return this.cancelOrder(order, 'seller', reason, SELLER_CANCELLABLE);
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

    if (!ALLOWED_TRANSITIONS[order.status].includes(next)) {
      throw new BadRequestException(
        `Không thể chuyển đơn từ "${STATUS_LABEL[order.status]}" sang "${STATUS_LABEL[next]}".`,
      );
    }

    const res = await this.orderModel.updateOne(
      { _id: order._id, status: order.status },
      {
        $set: { status: next },
        $push: { timeline: { status: next, at: new Date(), by: 'seller' } },
      },
    );
    if (res.modifiedCount !== 1) {
      throw new ConflictException(
        'Trạng thái đơn vừa thay đổi ở nơi khác. Vui lòng tải lại trang.',
      );
    }

    // Lượt bán chỉ cộng khi giao thành công — đơn huỷ không được tính.
    if (next === 'delivered') {
      // `deliveredAt` là gốc để tính thời gian giữ tiền trước khi cho rút, nên
      // phải là trường riêng chứ không lục lại trong timeline.
      await this.orderModel.updateOne(
        { _id: order._id },
        { $set: { deliveredAt: new Date() } },
      );
      await this.products.recordSold(this.stockItemsOf([order]));
    }

    return { ok: true, status: next };
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

  async getForShop(user: UserDocument, id: string) {
    const order = await this.findOwnedByShop(user, id);
    return { order: this.toSellerOrder(order, true) };
  }

  /** Số đơn theo từng trạng thái — cho badge trên thanh tab. */
  private async countByStatus(match: Record<string, unknown>) {
    const rows = await this.orderModel.aggregate<{ _id: OrderStatus; n: number }>([
      { $match: match },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]);
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
      note: o.note,
      cancelledBy: o.cancelledBy,
      cancelReason: o.cancelReason,
      createdAt: (o as unknown as { createdAt: Date }).createdAt,
    };
  }

  private toBuyerOrder(o: OrderDocument, full = false) {
    return {
      ...this.baseOrder(o),
      shop: { name: o.shopName, slug: o.shopSlug },
      canCancel: BUYER_CANCELLABLE.includes(o.status),
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
      nextStatus: ALLOWED_TRANSITIONS[o.status].filter((s) => s !== 'cancelled'),
      canCancel: SELLER_CANCELLABLE.includes(o.status),
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
      this.logger.log(`Đã huỷ ${cancelled} đơn quá hạn thanh toán và hoàn kho.`);
    }
    return cancelled;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredOrders() {
    await this.expireUnpaidOrders().catch((e: unknown) =>
      this.logger.error(`Lỗi khi dọn đơn quá hạn: ${String(e)}`),
    );
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
};

/** Chặn ký tự đặc biệt của regex trong từ khoá tìm kiếm do người dùng nhập. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
