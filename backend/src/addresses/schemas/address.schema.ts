import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AddressDocument = HydratedDocument<Address>;

/**
 * Address — sổ địa chỉ giao hàng, quan hệ 1 user : N địa chỉ.
 * Tách từng cấp hành chính để phục vụ giao hàng ở VN.
 */
@Schema({ timestamps: true })
export class Address {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  /** Nhãn: "Nhà", "Công ty"… */
  @Prop({ trim: true })
  label?: string;

  @Prop({ trim: true })
  recipientName?: string;

  @Prop({ trim: true })
  recipientPhone?: string;

  /** Địa chỉ chi tiết (số nhà, tên đường). */
  @Prop({ trim: true })
  street?: string;

  /** Phường/Xã. */
  @Prop({ trim: true })
  ward?: string;

  /** Quận/Huyện. */
  @Prop({ trim: true })
  district?: string;

  /** Tỉnh/Thành phố. */
  @Prop({ trim: true })
  province?: string;

  @Prop({ trim: true, default: 'VN' })
  country: string;

  @Prop({ trim: true })
  postalCode?: string;

  @Prop({ default: false })
  isDefault: boolean;
}

export const AddressSchema = SchemaFactory.createForClass(Address);
