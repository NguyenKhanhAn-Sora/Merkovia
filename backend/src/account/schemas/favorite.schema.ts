import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FavoriteDocument = HydratedDocument<Favorite>;

/**
 * Sản phẩm người mua đã lưu vào danh sách yêu thích.
 *
 * Tách thành collection riêng thay vì nhét mảng vào User: một người có thể
 * thích hàng nghìn sản phẩm, mà mảng trong document thì không phân trang được
 * và làm document phình mãi.
 */
@Schema({ timestamps: true })
export class Favorite {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  product: Types.ObjectId;
}

export const FavoriteSchema = SchemaFactory.createForClass(Favorite);

/**
 * Một người chỉ thích một sản phẩm MỘT lần.
 * Ràng buộc ở tầng CSDL chứ không chỉ kiểm tra trong code: hai lần bấm tim
 * cùng lúc thì chỉ một bản ghi được tạo, và `stats.favorites` không bị đếm lố.
 */
FavoriteSchema.index({ user: 1, product: 1 }, { unique: true });
FavoriteSchema.index({ user: 1, createdAt: -1 });
