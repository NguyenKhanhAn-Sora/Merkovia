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
import { ORDER_STATUS } from '../schemas/order.schema';

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
  @IsOptional()
  @IsString()
  @MaxLength(300)
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
