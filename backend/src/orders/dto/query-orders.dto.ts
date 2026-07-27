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
  MinLength,
  ValidateIf,
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
   * Nội dung tự nhập. BẮT BUỘC khi chọn "Khác" (other) — chọn nhãn khác thì bỏ
   * qua (ô nhập phía client đã chặn tối đa 300 ký tự cho phần ghi chú thêm).
   */
  @ValidateIf((o: CancelOrderDto) => o.reasonType === 'other')
  @IsString({ message: 'Vui lòng nhập lý do huỷ.' })
  @MinLength(5, { message: 'Vui lòng mô tả rõ hơn (ít nhất 5 ký tự).' })
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
