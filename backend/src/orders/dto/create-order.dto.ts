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

/** Mã giảm giá người mua áp cho MỘT gian hàng trong giỏ. */
export class CartVoucherDto {
  @IsMongoId({ message: 'Gian hàng không hợp lệ.' })
  shopId: string;

  @IsString({ message: 'Mã giảm giá không hợp lệ.' })
  @MaxLength(20, { message: 'Mã giảm giá không hợp lệ.' })
  code: string;
}

/*
 * Mọi thông báo lỗi ở đây đều viết bằng TIẾNG VIỆT và nói rõ phải sửa gì.
 * class-validator mặc định trả câu tiếng Anh kiểu "recipientName must be
 * longer than or equal to 2 characters" — thứ hiện thẳng lên màn hình người
 * mua thì họ không hiểu và cũng không biết sửa ô nào.
 */

/**
 * Một dòng hàng người mua gửi lên.
 *
 * 🔴 Cố tình KHÔNG nhận `price` từ client. Giá luôn được tra lại từ DB phía
 * server, nếu không ai cũng có thể sửa localStorage để mua giá 1 đồng.
 */
export class OrderItemDto {
  @IsMongoId({ message: 'Sản phẩm không hợp lệ.' })
  productId: string;

  @IsMongoId({ message: 'Phân loại sản phẩm không hợp lệ.' })
  variantId: string;

  @Type(() => Number)
  @IsInt({ message: 'Số lượng phải là số nguyên.' })
  @Min(1, { message: 'Số lượng phải lớn hơn 0.' })
  quantity: number;
}

/**
 * Phần ĐỊA LÝ của địa chỉ — chỉ những gì cần để tính cước vận chuyển.
 *
 * Tách riêng khỏi thông tin người nhận vì trang thanh toán phải báo giá được
 * NGAY khi chọn xong tỉnh/thành, lúc người mua còn chưa gõ tên. Gộp chung thì
 * họ bị báo "thiếu tên người nhận" trong ô phí vận chuyển — vừa sai chỗ vừa
 * khó hiểu.
 */
export class ShippingGeoDto {
  @IsString({ message: 'Vui lòng chọn tỉnh/thành phố.' })
  @MinLength(2, { message: 'Vui lòng chọn tỉnh/thành phố.' })
  @MaxLength(100, { message: 'Tên tỉnh/thành phố quá dài.' })
  province: string;

  /**
   * Mã hành chính + toạ độ — đầu vào để tính cước.
   * Optional vì địa chỉ nhập tay (không chọn từ gợi ý) vẫn phải đặt hàng được;
   * thiếu thì biểu cước lùi về mức liên tỉnh thay vì từ chối đơn.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Mã tỉnh/thành không hợp lệ.' })
  @Min(1, { message: 'Mã tỉnh/thành không hợp lệ.' })
  provinceCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Mã phường/xã không hợp lệ.' })
  @Min(1, { message: 'Mã phường/xã không hợp lệ.' })
  wardCode?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude({ message: 'Toạ độ địa chỉ không hợp lệ.' })
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: 'Toạ độ địa chỉ không hợp lệ.' })
  lng?: number;

  @IsOptional()
  @IsString({ message: 'Phường/xã không hợp lệ.' })
  @MaxLength(100, { message: 'Tên phường/xã quá dài.' })
  ward?: string;
}

/** Địa chỉ giao hàng đầy đủ — chỉ bắt buộc đủ khi THỰC SỰ đặt hàng. */
export class ShippingAddressDto extends ShippingGeoDto {
  /** Loại địa điểm giao — ảnh hưởng giờ giao được, nên chụp lại theo đơn. */
  @IsOptional()
  @IsString({ message: 'Loại địa chỉ không hợp lệ.' })
  @MaxLength(30, { message: 'Loại địa chỉ tối đa 30 ký tự.' })
  label?: string;

  @IsString({ message: 'Vui lòng nhập họ tên người nhận.' })
  @MinLength(2, { message: 'Họ tên người nhận phải có ít nhất 2 ký tự.' })
  @MaxLength(80, { message: 'Họ tên người nhận tối đa 80 ký tự.' })
  recipientName: string;

  @IsString({ message: 'Vui lòng nhập số điện thoại người nhận.' })
  @MinLength(8, { message: 'Số điện thoại phải có ít nhất 8 chữ số.' })
  @MaxLength(20, { message: 'Số điện thoại tối đa 20 ký tự.' })
  recipientPhone: string;

  @IsString({ message: 'Vui lòng nhập địa chỉ chi tiết.' })
  @MinLength(3, { message: 'Địa chỉ chi tiết phải có ít nhất 3 ký tự.' })
  @MaxLength(200, { message: 'Địa chỉ chi tiết tối đa 200 ký tự.' })
  street: string;

  @IsOptional()
  @IsString({ message: 'Quận/huyện không hợp lệ.' })
  @MaxLength(100, { message: 'Tên quận/huyện quá dài.' })
  district?: string;
}

/**
 * Sửa địa chỉ của một đơn đã đặt.
 *
 * Cùng ràng buộc với lúc đặt hàng — lệch nhau thì có địa chỉ đặt được mà sửa
 * lại không được (hoặc ngược lại). Phạm vi được sửa tới đâu do
 * `OrdersService.updateShippingAddress` quyết định theo trạng thái đơn.
 */
export class UpdateShippingAddressDto extends ShippingAddressDto {}

/** Phần chung của giỏ hàng, dùng cho cả báo giá lẫn đặt hàng. */
class CartBaseDto {
  @IsArray({ message: 'Giỏ hàng không hợp lệ.' })
  @ArrayNotEmpty({ message: 'Giỏ hàng đang trống.' })
  @ArrayMaxSize(50, { message: 'Mỗi lần đặt tối đa 50 sản phẩm.' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsIn(PAYMENT_METHODS, {
    message: 'Phương thức thanh toán không hợp lệ.',
  })
  paymentMethod: string;

  /** Mã giảm giá đã áp, tối đa một mã cho mỗi gian hàng trong giỏ. */
  @IsOptional()
  @IsArray({ message: 'Danh sách mã giảm giá không hợp lệ.' })
  @ArrayMaxSize(20, { message: 'Quá nhiều mã giảm giá.' })
  @ValidateNested({ each: true })
  @Type(() => CartVoucherDto)
  vouchers?: CartVoucherDto[];
}

/**
 * Báo giá giỏ hàng — CHỈ cần thông tin địa lý.
 * Không đòi tên/SĐT/địa chỉ chi tiết: người mua vừa chọn tỉnh là thấy được
 * cước ngay, không phải điền xong hết mới biết mình phải trả bao nhiêu.
 */
export class QuoteCartDto extends CartBaseDto {
  @ValidateNested()
  @Type(() => ShippingGeoDto)
  shippingAddress: ShippingGeoDto;
}

export class CreateOrderDto extends CartBaseDto {
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;

  @IsOptional()
  @IsString({ message: 'Lời nhắn không hợp lệ.' })
  @MaxLength(500, { message: 'Lời nhắn tối đa 500 ký tự.' })
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
