import {
  Controller,
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';

const MB = 1024 * 1024;

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Một handler, hai đường dẫn: `avatar` (giữ tương thích) và `image` (ảnh sản phẩm). */
  @Post(['avatar', 'image'])
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * MB }),
          new FileTypeValidator({ fileType: /image\/(png|jpe?g|webp|gif)/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.media.uploadAvatar({
      buffer: file.buffer,
      mimetype: file.mimetype,
    });
  }

  /**
   * Ảnh/video đính kèm đánh giá sản phẩm.
   *
   * Tách khỏi `/media/image` vì hai lý do:
   *  - Video cần hạn mức dung lượng RIÊNG (50 MB): dùng chung mức 5 MB của ảnh
   *    thì mọi video quay bằng điện thoại đều bị chặn.
   *  - **Bắt buộc đăng nhập và có giới hạn tần suất.** Đây là đường cho phép
   *    người lạ đẩy file lên kho của mình; để mở là mời người ta dùng làm chỗ
   *    chứa file miễn phí.
   */
  /**
   * Ảnh đính kèm tin nhắn. Có ĐĂNG NHẬP + giới hạn tần suất như `review`: đây
   * cũng là đường cho phép người dùng đẩy file lên kho, không được để mở.
   */
  @Post('chat')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * MB } }))
  uploadChatImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * MB }),
          new FileTypeValidator({ fileType: /image\/(png|jpe?g|webp|gif)/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.media.upload(
      { buffer: file.buffer, mimetype: file.mimetype },
      'chat',
    );
  }

  @Post('review')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  // Chặn ngay ở multer chứ không chỉ ở validator: validator chạy SAU khi cả
  // tệp đã nằm trong RAM, nên một file 2 GB vẫn kịp ngốn hết bộ nhớ trước khi
  // bị từ chối.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * MB } }))
  uploadReviewMedia(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 50 * MB }),
          new FileTypeValidator({
            fileType:
              /^(image\/(png|jpe?g|webp|gif)|video\/(mp4|quicktime|webm))$/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.media.upload(
      { buffer: file.buffer, mimetype: file.mimetype },
      'reviews',
    );
  }

  /**
   * Ảnh/video minh chứng đính kèm báo cáo vi phạm gian hàng.
   * Cùng giới hạn với `review` (50 MB, ảnh + video) — cùng mục đích: cho phép
   * người dùng chứng minh bằng hình ảnh thật thay vì chỉ mô tả bằng chữ.
   */
  @Post('report')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * MB } }))
  uploadReportEvidence(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 50 * MB }),
          new FileTypeValidator({
            fileType:
              /^(image\/(png|jpe?g|webp|gif)|video\/(mp4|quicktime|webm))$/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.media.upload(
      { buffer: file.buffer, mimetype: file.mimetype },
      'reports',
    );
  }

  /**
   * Ảnh banner carousel trang chủ. Chỉ admin — khác mọi route upload khác ở
   * trên (đều dành cho buyer/seller), banner là nội dung admin toàn quyền
   * kiểm soát, không có phía nào khác được đẩy ảnh vào đây.
   *
   * Hạn mức cao hơn `/media/image` (10MB thay vì 5MB): route này nhận CẢ ảnh
   * đã cắt (nhẹ, luôn cỡ 1600×500) LẪN ảnh gốc chưa cắt admin tải lên (có thể
   * là file thiết kế gốc độ phân giải cao) — xem `BannerFormModal.tsx`.
   */
  @Post('banner')
  @UseGuards(AdminAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * MB } }))
  uploadBanner(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * MB }),
          new FileTypeValidator({ fileType: /image\/(png|jpe?g|webp)/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.media.upload(
      { buffer: file.buffer, mimetype: file.mimetype },
      'banners',
    );
  }
}
