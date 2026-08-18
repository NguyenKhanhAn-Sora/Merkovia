import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type FollowDocument = HydratedDocument<Follow>;

/**
 * Người mua theo dõi một gian hàng — để nhận thông báo khi shop có sản phẩm
 * mới/khuyến mãi mới, và để có trang riêng liệt kê lại các shop yêu thích.
 *
 * Tách collection riêng (giống `Favorite`) thay vì nhét mảng vào User: một
 * người có thể theo dõi rất nhiều shop, mảng trong document không phân trang
 * và lọc theo shop (để báo tin) được.
 */
@Schema({ timestamps: true })
export class Follow {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  // Không đánh `index: true` ở đây — trùng với `FollowSchema.index({ shop: 1 })`
  // bên dưới (mongoose cảnh báo duplicate index nếu khai cả hai).
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Shop', required: true })
  shop: Types.ObjectId;
}

export const FollowSchema = SchemaFactory.createForClass(Follow);

/**
 * Một người chỉ theo dõi một shop MỘT lần — ràng buộc ở tầng CSDL, không chỉ
 * kiểm tra trong code: bấm theo dõi hai lần liên tiếp thật nhanh vẫn chỉ tạo
 * đúng một bản ghi.
 */
FollowSchema.index({ user: 1, shop: 1 }, { unique: true });
// Trang "Đang theo dõi" của buyer: mới theo dõi trước.
FollowSchema.index({ user: 1, createdAt: -1 });
// Báo tin cho TOÀN BỘ follower của một shop khi có sản phẩm/khuyến mãi mới.
FollowSchema.index({ shop: 1 });
