import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_COMMENT, MAX_MEDIA, MEDIA_KINDS } from '../schemas/review.schema';

export class ReviewMediaDto {
  @IsIn(MEDIA_KINDS, { message: 'Loại tệp đính kèm không hợp lệ.' })
  kind: string;

  @IsString({ message: 'Tệp đính kèm không hợp lệ.' })
  @MaxLength(500, { message: 'Đường dẫn tệp quá dài.' })
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  key?: string;
}

export class CreateReviewDto {
  @IsMongoId({ message: 'Đơn hàng không hợp lệ.' })
  orderId: string;

  /** Dòng hàng trong đơn — mỗi biến thể đã mua đánh giá riêng. */
  @IsMongoId({ message: 'Sản phẩm trong đơn không hợp lệ.' })
  variantId: string;

  @Type(() => Number)
  @IsInt({ message: 'Vui lòng chọn số sao.' })
  @Min(1, { message: 'Vui lòng chọn từ 1 đến 5 sao.' })
  @Max(5, { message: 'Vui lòng chọn từ 1 đến 5 sao.' })
  rating: number;

  @IsOptional()
  @IsString({ message: 'Nội dung đánh giá không hợp lệ.' })
  @MaxLength(MAX_COMMENT, {
    message: `Nội dung đánh giá tối đa ${MAX_COMMENT} ký tự.`,
  })
  comment?: string;

  @IsOptional()
  @IsArray({ message: 'Danh sách tệp đính kèm không hợp lệ.' })
  @ArrayMaxSize(MAX_MEDIA, {
    message: `Mỗi đánh giá đính kèm tối đa ${MAX_MEDIA} ảnh/video.`,
  })
  @ValidateNested({ each: true })
  @Type(() => ReviewMediaDto)
  media?: ReviewMediaDto[];

  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;
}

/** Sửa đánh giá đã đăng — cùng khuôn với lúc tạo, chỉ bỏ đơn/biến thể (cố định). */
export class UpdateReviewDto {
  @Type(() => Number)
  @IsInt({ message: 'Vui lòng chọn số sao.' })
  @Min(1, { message: 'Vui lòng chọn từ 1 đến 5 sao.' })
  @Max(5, { message: 'Vui lòng chọn từ 1 đến 5 sao.' })
  rating: number;

  @IsOptional()
  @IsString({ message: 'Nội dung đánh giá không hợp lệ.' })
  @MaxLength(MAX_COMMENT, {
    message: `Nội dung đánh giá tối đa ${MAX_COMMENT} ký tự.`,
  })
  comment?: string;

  @IsOptional()
  @IsArray({ message: 'Danh sách tệp đính kèm không hợp lệ.' })
  @ArrayMaxSize(MAX_MEDIA, {
    message: `Mỗi đánh giá đính kèm tối đa ${MAX_MEDIA} ảnh/video.`,
  })
  @ValidateNested({ each: true })
  @Type(() => ReviewMediaDto)
  media?: ReviewMediaDto[];

  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;
}

/** Phản hồi của người bán. */
export class ReplyReviewDto {
  @IsString({ message: 'Vui lòng nhập nội dung phản hồi.' })
  @MinLength(2, { message: 'Phản hồi phải có ít nhất 2 ký tự.' })
  @MaxLength(MAX_COMMENT, {
    message: `Phản hồi tối đa ${MAX_COMMENT} ký tự.`,
  })
  reply: string;
}

export class ListReviewsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** Lọc theo số sao; bỏ trống = tất cả. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Bộ lọc số sao không hợp lệ.' })
  @Min(1)
  @Max(5)
  rating?: number;

  /** `true` = chỉ đánh giá có ảnh/video. */
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'Bộ lọc không hợp lệ.' })
  hasMedia?: string;
}

export class ListShopReviewsDto extends ListReviewsDto {
  /** `unanswered` = chưa phản hồi, `low` = từ 3 sao trở xuống. */
  @IsOptional()
  @IsIn(['all', 'unanswered', 'low'], { message: 'Bộ lọc không hợp lệ.' })
  tab?: string;
}

/* -------------------------------- Admin --------------------------------- */

export class AdminListReviewsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsMongoId({ message: 'Gian hàng không hợp lệ.' })
  shopId?: string;

  @IsOptional()
  @IsMongoId({ message: 'Sản phẩm không hợp lệ.' })
  productId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Bộ lọc số sao không hợp lệ.' })
  @Min(1)
  @Max(5)
  rating?: number;

  /** `hidden` = chỉ đánh giá đã ẩn, `visible` = chỉ đánh giá còn hiển thị. */
  @IsOptional()
  @IsIn(['all', 'hidden', 'visible'], { message: 'Bộ lọc không hợp lệ.' })
  hidden?: string;

  /** Tìm theo nội dung đánh giá, tên người mua, tên sản phẩm hoặc gian hàng. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

/** Ẩn đánh giá hoặc phản hồi — lý do bắt buộc, gửi cho tác giả nội dung bị ẩn. */
export class HideReviewContentDto {
  @IsString({ message: 'Vui lòng nhập lý do ẩn.' })
  @MinLength(5, { message: 'Lý do ẩn cần ít nhất 5 ký tự — nội dung này gửi cho tác giả.' })
  @MaxLength(300, { message: 'Lý do ẩn tối đa 300 ký tự.' })
  reason: string;
}
