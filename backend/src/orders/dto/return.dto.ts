import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { RETURN_REASONS } from '../schemas/order.schema';

/** Người mua yêu cầu trả hàng. */
export class RequestReturnDto {
  @IsIn(RETURN_REASONS, { message: 'Vui lòng chọn lý do trả hàng.' })
  reasonType: (typeof RETURN_REASONS)[number];

  /**
   * Nội dung tự nhập. BẮT BUỘC khi chọn "Khác" (other) — chọn nhãn có sẵn thì
   * đây là mô tả thêm không bắt buộc (ô nhập client đã chặn tối đa 500 ký tự).
   */
  @ValidateIf((o: RequestReturnDto) => o.reasonType === 'other')
  @IsString({ message: 'Vui lòng nhập lý do trả hàng.' })
  @MinLength(10, { message: 'Vui lòng mô tả rõ hơn (ít nhất 10 ký tự).' })
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  reason?: string;
}

/** Người bán trả lời yêu cầu trả hàng của người mua. */
export class RespondReturnDto {
  @IsBoolean({ message: 'Vui lòng chọn đồng ý hoặc từ chối.' })
  approve: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'Ghi chú tối đa 300 ký tự.' })
  note?: string;
}
