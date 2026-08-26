import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CANCEL_REASONS, ORDER_STATUS } from '../schemas/order.schema';

/** Bộ lọc danh sách đơn — dùng chung cho cả người mua và người bán. */
export class QueryOrdersDto {
  @IsOptional()
  @IsIn(ORDER_STATUS)
  status?: string;

  /** Tìm theo mã đơn, tên người nhận hoặc số điện thoại (phía người bán). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** Người bán đổi trạng thái đơn. */
export class UpdateOrderStatusDto {
  @IsIn(['confirmed', 'shipping', 'delivered'])
  status: string;
}

export class CancelOrderDto {
  /** Nhóm lý do có sẵn. Không gửi (huỷ bởi người bán/hệ thống) thì bỏ qua. */
  @IsOptional()
  @IsIn(CANCEL_REASONS, { message: 'Vui lòng chọn lý do huỷ.' })
  reasonType?: (typeof CANCEL_REASONS)[number];

  /**
   * Nội dung tự nhập. Gợi ý mô tả rõ khi chọn "Khác" (other) — ô nhập phía
   * client đã yêu cầu/chặn theo đúng gợi ý đó, nên không lặp lại ràng buộc
   * "bắt buộc khi other" ở đây.
   *
   * 🔴 CỐ TÌNH không dùng `@ValidateIf`: class-validator gom TOÀN BỘ validator
   * của một property lại rồi mới xét điều kiện — hễ dùng `@ValidateIf` là MỌI
   * validator khác trên CÙNG property (kể cả `@MaxLength`) đều bị bỏ qua khi
   * điều kiện sai, không có cách nào "chỉ áp điều kiện cho riêng MinLength".
   * Trước đây gộp chung khiến `reasonType` khác "other" đi kèm lý do dài tuỳ ý
   * lọt qua validation hoàn toàn (không kiểm tra 300 ký tự) — chuỗi đó sau này
   * ghép vào `Payment.refundReason` (giới hạn 300 ký tự ở schema) và làm
   * `flagRefundForOrder` lưu thất bại, mất luôn dấu hiệu "cần hoàn tiền".
   * `MaxLength` giờ LUÔN áp dụng, không phụ thuộc `reasonType`.
   */
  @IsOptional()
  @IsString({ message: 'Lý do không hợp lệ.' })
  @MaxLength(300, { message: 'Lý do tối đa 300 ký tự.' })
  reason?: string;
}

/** Người bán trả lời yêu cầu huỷ của người mua. */
export class RespondCancelDto {
  @IsBoolean({ message: 'Vui lòng chọn đồng ý hoặc từ chối.' })
  approve: boolean;

  /** Lý do từ chối — người mua cần biết vì sao đơn vẫn chạy tiếp. */
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Ghi chú tối đa 300 ký tự.' })
  note?: string;
}
