import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { config } from '../config/config';

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  // Video trong đánh giá sản phẩm. mp4 (H.264) là định dạng điện thoại nào
  // cũng quay ra và trình duyệt nào cũng phát được; quicktime là .mov của iPhone.
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export interface UploadedMedia {
  url: string;
  key: string;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly r2 = config.r2;

  private readonly client: S3Client | null = this.isConfigured()
    ? new S3Client({
        region: 'auto',
        endpoint: this.endpoint(),
        credentials: {
          accessKeyId: this.r2.accessKeyId,
          secretAccessKey: this.r2.secretAccessKey,
        },
      })
    : null;

  private endpoint(): string {
    return (
      this.r2.endpoint ||
      `https://${this.r2.accountId}.r2.cloudflarestorage.com`
    );
  }

  isConfigured(): boolean {
    return Boolean(
      this.r2.accessKeyId &&
        this.r2.secretAccessKey &&
        this.r2.bucket &&
        (this.r2.endpoint || this.r2.accountId) &&
        this.r2.publicBaseUrl,
    );
  }

  private ensureReady(): S3Client {
    if (!this.client) {
      throw new HttpException(
        'Lưu trữ media (R2) chưa được cấu hình. Hãy điền các biến R2_* trong .env.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.client;
  }

  /** Upload ảnh đại diện, trả về URL công khai. */
  uploadAvatar(file: {
    buffer: Buffer;
    mimetype: string;
  }): Promise<UploadedMedia> {
    return this.upload(file, 'avatars');
  }

  /**
   * Upload một tệp vào thư mục chỉ định.
   *
   * Tách thư mục theo mục đích (`avatars/`, `reviews/`) để sau này còn đặt được
   * vòng đời lưu trữ khác nhau trên R2 — video đánh giá nặng hơn ảnh đại diện
   * hàng chục lần.
   */
  async upload(
    file: { buffer: Buffer; mimetype: string },
    folder: string,
  ): Promise<UploadedMedia> {
    const client = this.ensureReady();
    const ext = EXT_BY_MIME[file.mimetype] ?? 'bin';
    const key = `${folder}/${randomUUID()}.${ext}`;

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: this.r2.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } catch (err) {
      this.logger.error('Upload R2 thất bại', err as Error);
      throw new HttpException(
        'Tải tệp lên thất bại. Vui lòng thử lại.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const url = `${this.r2.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    return { url, key };
  }

  /** Xoá object theo key (dùng khi thay/huỷ avatar). */
  async delete(key: string): Promise<void> {
    const client = this.ensureReady();
    await client.send(
      new DeleteObjectCommand({ Bucket: this.r2.bucket, Key: key }),
    );
  }
}
