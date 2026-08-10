import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PAYOUT_STATUS } from '../schemas/payout.schema';

export class QueryAdminPayoutsDto {
  @IsOptional()
  @IsIn(PAYOUT_STATUS)
  status?: string;

  /** Tìm theo mã đợt chi hoặc tên gian hàng. */
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
  @Max(100)
  limit?: number;
}

/**
 * Admin chốt thủ công một đợt chi đang kẹt ở `processing` mà không tra cứu
 * được từ nhà cung cấp — bắt buộc ghi lý do/bằng chứng vì đây là quyết định
 * thay cho phản hồi thật của nhà cung cấp.
 */
export class ResolvePayoutDto {
  @IsIn(['paid', 'failed'])
  action: 'paid' | 'failed';

  @IsString()
  @MinLength(5, {
    message: 'Vui lòng ghi rõ căn cứ xác nhận (ít nhất 5 ký tự).',
  })
  @MaxLength(500)
  note: string;
}
