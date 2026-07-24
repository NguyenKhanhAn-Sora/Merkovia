import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RETURN_REASONS } from '../schemas/order.schema';

/** Người mua yêu cầu trả hàng. */
export class RequestReturnDto {
  @IsIn(RETURN_REASONS, { message: 'Vui lòng chọn lý do trả hàng.' })
  reasonType: (typeof RETURN_REASONS)[number];

  /**
   * Mô tả bắt buộc: yêu cầu trả hàng đụng tới tiền của cả hai bên, người bán
   * cần căn cứ cụ thể để duyệt chứ không chỉ một nhãn lý do chung chung.
   */
  @IsString()
  @MinLength(10, { message: 'Vui lòng mô tả rõ hơn (ít nhất 10 ký tự).' })
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  reason: string;
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
