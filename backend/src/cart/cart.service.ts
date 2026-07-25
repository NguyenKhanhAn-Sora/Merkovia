import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cart, CartDocument } from './schemas/cart.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { isDealLive } from '../products/deal';
import type { UserDocument } from '../users/schemas/user.schema';

/** Số dòng tối đa trong một giỏ — chặn nhồi giỏ vô hạn. */
const MAX_LINES = 50;

interface AddInput {
  productId: string;
  variantId: string;
  quantity: number;
}

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
  ) {}

  /* ------------------------------- Đọc giỏ ------------------------------ */

  async get(user: UserDocument) {
    const cart = await this.cartModel.findOne({ user: user._id });
    return { items: await this.enrich(cart) };
  }

  /**
   * Gắn dữ liệu HIỆN TẠI cho từng dòng: tên, ảnh, giá (đã áp khuyến mãi đang
   * chạy), tồn kho, tên gian hàng. Dòng nào sản phẩm/biến thể đã biến mất hoặc
   * bị gỡ thì đánh `available: false` để giao diện làm mờ + mời xoá, thay vì
   * lẳng lặng rớt khỏi giỏ khiến người mua tưởng mất hàng.
   */
  private async enrich(cart: CartDocument | null) {
    if (!cart || cart.items.length === 0) return [];

    const productIds = [...new Set(cart.items.map((i) => String(i.product)))].map(
      (id) => new Types.ObjectId(id),
    );
    const products = await this.productModel.find({ _id: { $in: productIds } });
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const shopIds = [...new Set(products.map((p) => String(p.shop)))].map(
      (id) => new Types.ObjectId(id),
    );
    const shops = await this.shopModel
      .find({ _id: { $in: shopIds } })
      .select('name slug')
      .lean();
    const byShop = new Map(shops.map((s) => [String(s._id), s]));

    return cart.items.map((item) => {
      const product = byId.get(String(item.product));
      const variant = product?.variants?.find(
        (v) => String(v._id) === String(item.variant),
      );
      const live =
        !!product &&
        product.status === 'active' &&
        !product.deletedAt &&
        !!variant &&
        variant.isActive;

      const shop = product ? byShop.get(String(product.shop)) : undefined;
      const listPrice = variant?.price ?? 0;
      const price =
        product && isDealLive(product.activeDeal)
          ? Math.min(product.activeDeal!.price, listPrice)
          : listPrice;

      return {
        productId: String(item.product),
        variantId: String(item.variant),
        productSlug: product?.slug,
        name: product?.name ?? 'Sản phẩm không còn tồn tại',
        variantLabel: (variant?.optionValues ?? []).join(' / '),
        image: variant?.image ?? product?.images?.[0]?.url,
        price,
        quantity: item.quantity,
        stock: variant?.stock ?? 0,
        shopName: shop?.name,
        shopSlug: shop?.slug,
        /** Còn mua được không (giao diện dựa vào đây để tô mờ / chặn đặt). */
        available: live && (variant?.stock ?? 0) > 0,
      };
    });
  }

  /* ------------------------------- Ghi giỏ ------------------------------ */

  /** Kiểm sản phẩm/biến thể còn bán được và trả về tồn kho hiện tại. */
  private async validate(productId: string, variantId: string) {
    if (!Types.ObjectId.isValid(productId) || !Types.ObjectId.isValid(variantId)) {
      throw new BadRequestException('Sản phẩm không hợp lệ.');
    }
    const product = await this.productModel.findOne({
      _id: productId,
      status: 'active',
      deletedAt: null,
    });
    const variant = product?.variants?.find(
      (v) => String(v._id) === variantId && v.isActive,
    );
    if (!product || !variant) {
      throw new BadRequestException('Sản phẩm này hiện không bán được.');
    }
    return variant.stock;
  }

  private async loadOrCreate(user: UserDocument): Promise<CartDocument> {
    return this.cartModel.findOneAndUpdate(
      { user: user._id },
      { $setOnInsert: { user: user._id, items: [] } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  async add(user: UserDocument, dto: AddInput) {
    const stock = await this.validate(dto.productId, dto.variantId);
    if (stock <= 0) {
      throw new BadRequestException('Sản phẩm đã hết hàng.');
    }

    const cart = await this.loadOrCreate(user);
    const line = cart.items.find(
      (i) =>
        String(i.product) === dto.productId &&
        String(i.variant) === dto.variantId,
    );

    if (line) {
      // Cộng dồn nhưng KHÔNG vượt tồn kho hiện tại.
      line.quantity = Math.min(line.quantity + dto.quantity, stock);
    } else {
      if (cart.items.length >= MAX_LINES) {
        throw new BadRequestException(
          `Giỏ hàng tối đa ${MAX_LINES} sản phẩm khác nhau.`,
        );
      }
      cart.items.push({
        product: new Types.ObjectId(dto.productId),
        variant: new Types.ObjectId(dto.variantId),
        quantity: Math.min(Math.max(1, dto.quantity), stock),
        addedAt: new Date(),
      });
    }

    await cart.save();
    return { items: await this.enrich(cart) };
  }

  async setQuantity(
    user: UserDocument,
    productId: string,
    variantId: string,
    quantity: number,
  ) {
    const cart = await this.cartModel.findOne({ user: user._id });
    if (!cart) return { items: [] };

    if (quantity <= 0) {
      return this.remove(user, productId, variantId);
    }

    const stock = await this.validate(productId, variantId).catch(() => 0);
    const line = cart.items.find(
      (i) => String(i.product) === productId && String(i.variant) === variantId,
    );
    if (line) {
      // Tồn kho là trần; nếu sản phẩm đã hết bán thì `stock = 0` → xoá dòng.
      const capped = Math.min(quantity, stock);
      if (capped <= 0) {
        cart.items = cart.items.filter((i) => i !== line);
      } else {
        line.quantity = capped;
      }
      await cart.save();
    }
    return { items: await this.enrich(cart) };
  }

  async remove(user: UserDocument, productId: string, variantId: string) {
    const cart = await this.cartModel.findOne({ user: user._id });
    if (!cart) return { items: [] };
    cart.items = cart.items.filter(
      (i) =>
        !(
          String(i.product) === productId && String(i.variant) === variantId
        ),
    );
    await cart.save();
    return { items: await this.enrich(cart) };
  }

  async clear(user: UserDocument) {
    await this.cartModel.updateOne(
      { user: user._id },
      { $set: { items: [] } },
    );
    return { items: [] };
  }

  /**
   * Gộp giỏ khách vãng lai (localStorage) vào giỏ server khi đăng nhập.
   *
   * Bỏ qua dòng lỗi thay vì ném: đăng nhập không được thất bại chỉ vì một món
   * trong giỏ tạm đã hết bán. Cộng dồn với dòng sẵn có, chặn trần tồn kho.
   */
  async merge(user: UserDocument, lines: AddInput[]) {
    const cart = await this.loadOrCreate(user);

    for (const l of lines.slice(0, MAX_LINES)) {
      const stock = await this.validate(l.productId, l.variantId).catch(() => 0);
      if (stock <= 0) continue;

      const existing = cart.items.find(
        (i) =>
          String(i.product) === l.productId &&
          String(i.variant) === l.variantId,
      );
      if (existing) {
        existing.quantity = Math.min(existing.quantity + l.quantity, stock);
      } else if (cart.items.length < MAX_LINES) {
        cart.items.push({
          product: new Types.ObjectId(l.productId),
          variant: new Types.ObjectId(l.variantId),
          quantity: Math.min(Math.max(1, l.quantity), stock),
          addedAt: new Date(),
        });
      }
    }

    await cart.save();
    return { items: await this.enrich(cart) };
  }
}
