import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  EVIDENCE_KINDS,
  MAX_EVIDENCE,
  REPORT_ACTIONS,
  REPORT_REASONS,
} from '../schemas/shop-report.schema';

export class ReportEvidenceDto {
  @IsIn(EVIDENCE_KINDS, { message: 'Loại tệp đính kèm không hợp lệ.' })
  kind: string;

  @IsString({ message: 'Tệp đính kèm không hợp lệ.' })
  @MaxLength(500, { message: 'Đường dẫn tệp quá dài.' })
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  key?: string;
}

/** Người mua gửi báo cáo vi phạm một gian hàng. */
export class CreateShopReportDto {
  @IsMongoId({ message: 'Gian hàng không hợp lệ.' })
  shopId: string;

  @IsIn(REPORT_REASONS, { message: 'Vui lòng chọn lý do báo cáo.' })
  reasonType: (typeof REPORT_REASONS)[number];

  /** Bắt buộc khi chọn "Khác" — còn lại là mô tả thêm, không bắt buộc. */
  @ValidateIf((o: CreateShopReportDto) => o.reasonType === 'other')
  @IsString({ message: 'Vui lòng mô tả vấn đề bạn gặp phải.' })
  @MinLength(10, { message: 'Vui lòng mô tả rõ hơn (ít nhất 10 ký tự).' })
  @MaxLength(500, { message: 'Mô tả tối đa 500 ký tự.' })
  detail?: string;

  /** Báo cáo mở từ trang chi tiết đơn — server tự xác minh đơn thuộc về người gửi + đúng shop. */
  @IsOptional()
  @IsMongoId({ message: 'Đơn hàng không hợp lệ.' })
  orderId?: string;

  /** Ảnh/video minh chứng — không bắt buộc, nhưng giúp admin xác nhận vi phạm nhanh hơn nhiều. */
  @IsOptional()
  @IsArray({ message: 'Danh sách tệp đính kèm không hợp lệ.' })
  @ArrayMaxSize(MAX_EVIDENCE, {
    message: `Tối đa ${MAX_EVIDENCE} ảnh/video đính kèm.`,
  })
  @ValidateNested({ each: true })
  @Type(() => ReportEvidenceDto)
  evidence?: ReportEvidenceDto[];
}

/** Admin xử lý TẤT CẢ báo cáo đang chờ của một shop cùng một lúc. */
export class ResolveShopReportDto {
  @IsIn(REPORT_ACTIONS, { message: 'Hành động không hợp lệ.' })
  action: (typeof REPORT_ACTIONS)[number];

  /** Bắt buộc với `warning`/`suspend` — nội dung này gửi thẳng cho shop nên cần rõ ràng. */
  @ValidateIf((o: ResolveShopReportDto) => o.action !== 'dismiss')
  @IsString({ message: 'Vui lòng ghi rõ lý do để thông báo cho gian hàng.' })
  @MinLength(10, { message: 'Vui lòng mô tả rõ hơn (ít nhất 10 ký tự).' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự.' })
  note?: string;

  /**
   * Chỉ áp dụng khi `action === 'suspend'`. Có giá trị = đình chỉ có thời hạn,
   * tự động gỡ khi hết hạn. Không gửi/undefined = đình chỉ VÔ THỜI HẠN, admin
   * phải tự gỡ tay (xem `POST /admin/shop-reports/shop/:shopId/unsuspend`).
   */
  @IsOptional()
  @ValidateIf((o: ResolveShopReportDto) => o.suspendDays !== undefined)
  @IsInt({ message: 'Số ngày đình chỉ phải là số nguyên.' })
  @Min(1, { message: 'Đình chỉ tối thiểu 1 ngày.' })
  @Max(365, { message: 'Đình chỉ tối đa 365 ngày.' })
  suspendDays?: number;
}

/** Hàng đợi ưu tiên hoặc lịch sử xử lý — lọc theo tên gian hàng. */
export class SearchShopReportsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
