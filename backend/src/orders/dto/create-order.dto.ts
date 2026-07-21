import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PAYMENT_METHODS } from '../schemas/order.schema';

/**
 * Một dòng hàng người mua gửi lên.
 *
 * 🔴 Cố tình KHÔNG nhận `price` từ client. Giá luôn được tra lại từ DB phía
 * server, nếu không ai cũng có thể sửa localStorage để mua giá 1 đồng.
 */
export class OrderItemDto {
  @IsMongoId()
  productId: string;

  @IsMongoId()
  variantId: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;
}

export class ShippingAddressDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  recipientName: string;

  /**
   * Mã hành chính + toạ độ — đầu vào để tính cước vận chuyển.
   * Optional vì địa chỉ nhập tay (không chọn từ gợi ý) vẫn phải đặt hàng được;
   * thiếu thì biểu cước lùi về mức liên tỉnh thay vì từ chối đơn.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  provinceCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  wardCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  recipientPhone: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  street: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ward?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  province: string;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;

  @IsIn(PAYMENT_METHODS)
  paymentMethod: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /**
   * Khoá chống trùng do client sinh. Bấm đúp "Đặt hàng" hoặc mạng chập chờn
   * khiến gửi lại → lần sau trả về đúng đơn đã tạo thay vì trừ kho lần nữa.
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  clientToken?: string;
}
