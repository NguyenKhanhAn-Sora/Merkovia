import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type CartDocument = HydratedDocument<Cart>;

/**
 * Một dòng giỏ = một biến thể cụ thể + số lượng.
 *
 * 🔴 CHỈ lưu tham chiếu + số lượng, KHÔNG chụp tên/giá/ảnh như đơn hàng. Giỏ
 * hàng phải phản ánh HIỆN TẠI: giá đổi, hết hàng, sản phẩm bị gỡ đều hiện đúng
 * ngay khi mở giỏ. Đơn hàng thì ngược lại — chụp cứng lúc đặt. Enrich khi đọc.
 */
@Schema({ _id: false })
export class CartItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  product: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  variant: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  quantity: number;

  /** Thời điểm thêm — dòng mới thêm hiện lên đầu giỏ. */
  @Prop({ default: () => new Date() })
  addedAt: Date;
}
const CartItemSchema = SchemaFactory.createForClass(CartItem);

/** Giỏ hàng của MỘT người mua (một-một với User). */
@Schema({ timestamps: true })
export class Cart {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  user: Types.ObjectId;

  @Prop({ type: [CartItemSchema], default: [] })
  items: CartItem[];
}

export const CartSchema = SchemaFactory.createForClass(Cart);
