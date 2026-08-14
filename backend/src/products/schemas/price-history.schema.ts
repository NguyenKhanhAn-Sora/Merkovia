import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type PriceHistoryDocument = HydratedDocument<PriceHistory>;

/**
 * Một mốc `Product.priceMin` từng có — ghi mỗi khi giá THỰC SỰ đổi (xem
 * `ProductsService.create`/`update`). Dùng để phát hiện việc shop đẩy giá lên
 * cao rồi đặt khuyến mãi ngay sau đó nhằm tạo % giảm giá ảo — xem
 * `PriceHistoryService.findPreHikeReference` và `PromotionsService.setDeal`.
 */
@Schema({ timestamps: true })
export class PriceHistory {
  /**
   * 🔴 `MongooseSchema.Types.ObjectId`, KHÔNG PHẢI `Types.ObjectId` — xem
   * memory `merkovia-objectid-gotcha`: `Types.ObjectId` (lớp giá trị BSON) và
   * `Schema.Types.ObjectId` (SchemaType) là hai lớp khác nhau trong bản
   * Mongoose này; dùng nhầm cái đầu khiến field âm thầm thành `Mixed`, không
   * tự ép kiểu string→ObjectId khi truy vấn — bắt được bug này ngay khi viết
   * test tích hợp (query bằng string productId ra rỗng dù DB có dữ liệu).
   */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true,
  })
  product: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  priceMin: number;
}

export const PriceHistorySchema = SchemaFactory.createForClass(PriceHistory);

/** Truy vấn "lịch sử giá của 1 sản phẩm trong N ngày gần đây", mới nhất trước. */
PriceHistorySchema.index({ product: 1, createdAt: -1 });
