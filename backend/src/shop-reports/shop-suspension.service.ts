import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { config } from '../config/config';

const QUEUE_NAME = 'shop-unsuspend';

/**
 * Lên lịch TỰ ĐỘNG gỡ đình chỉ gian hàng khi hết hạn, qua BullMQ/Redis Cloud —
 * chọn hàng đợi lên lịch (delay chính xác tới thời điểm) thay vì cron quét
 * định kỳ như các job khác trong hệ thống (xem `OrdersService.handleStaleSellerOrders`)
 * vì đây là lựa chọn có chủ đích của người vận hành cho tác vụ này, không phải
 * quy tắc chung — các job "quét theo lô mỗi N phút" khác trong app vẫn giữ
 * nguyên cách cũ, không có lý do đổi hết sang Redis.
 *
 * 🔴 Redis là NGOẠI VI, không phải một phần bắt buộc để app boot: thiếu
 * `REDIS_URL` thì tính năng tự động gỡ TẮT (đình chỉ có hạn vẫn tạo được,
 * chỉ là không ai tự gỡ — admin phải gỡ tay), giống triết lý Goong/Gemini/R2.
 */
@Injectable()
export class ShopSuspensionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShopSuspensionService.name);
  private queue?: Queue<{ shopId: string }>;
  private worker?: Worker<{ shopId: string }>;

  constructor(
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    if (!config.redis.url) {
      this.logger.warn(
        'REDIS_URL chưa cấu hình — tự động gỡ đình chỉ theo hạn TẮT, admin phải gỡ tay khi hết hạn.',
      );
      return;
    }
    // Queue và Worker dùng RIÊNG kết nối mỗi bên (khuyến nghị của BullMQ) —
    // Worker cần `maxRetriesPerRequest: null` vì nó chờ lệnh blocking.
    const queueConnection = new IORedis(config.redis.url, {
      maxRetriesPerRequest: null,
    });
    const workerConnection = new IORedis(config.redis.url, {
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue(QUEUE_NAME, { connection: queueConnection });
    this.worker = new Worker(
      QUEUE_NAME,
      (job: Job<{ shopId: string }>) => this.handleUnsuspend(job.data.shopId),
      { connection: workerConnection },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Job gỡ đình chỉ shop ${job?.data.shopId} lỗi: ${err.message}`,
      );
    });
    this.logger.log('Đã kết nối Redis — tự động gỡ đình chỉ theo hạn BẬT.');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  private jobId(shopId: string): string {
    return `unsuspend-${shopId}`;
  }

  /**
   * Lên lịch gỡ đình chỉ tại `unsuspendAt`. Luôn HUỶ job cũ trước khi thêm mới
   * — admin đình chỉ lại hoặc đổi thời hạn thì không được để job cũ (hạn cũ)
   * còn tồn tại song song, kẻo shop bị gỡ nhầm vào một thời điểm không còn
   * đúng nữa.
   */
  async schedule(shopId: string, unsuspendAt: Date): Promise<void> {
    if (!this.queue) return; // Redis tắt — chỉ còn cách gỡ tay.
    await this.cancel(shopId);
    const delay = Math.max(0, unsuspendAt.getTime() - Date.now());
    await this.queue.add(
      'unsuspend',
      { shopId },
      { jobId: this.jobId(shopId), delay },
    );
  }

  /** Huỷ lịch gỡ đình chỉ đang chờ — dùng khi admin gỡ tay sớm hoặc đổi sang đình chỉ vô thời hạn. */
  async cancel(shopId: string): Promise<void> {
    if (!this.queue) return;
    const job = await this.queue.getJob(this.jobId(shopId));
    if (job) await job.remove();
  }

  /**
   * Chỉ gỡ khi shop VẪN đang `suspended` — phòng trường hợp admin đã gỡ tay
   * hoặc đổi hạn trước khi job kịp chạy (dù `schedule()` đã huỷ job cũ, vẫn
   * kiểm tra lại ở đây cho chắc, tránh phụ thuộc hoàn toàn vào một nơi).
   */
  private async handleUnsuspend(shopId: string): Promise<void> {
    const shop = await this.shopModel.findOneAndUpdate(
      { _id: shopId, status: 'suspended' },
      { $set: { status: 'active', suspendedUntil: null } },
      { new: true },
    );
    if (!shop) return;

    await this.notifications.notifyUser(shop.owner, 'seller', {
      type: 'shop_suspension_lifted',
      title: 'Gian hàng của bạn đã được gỡ đình chỉ',
      body: `Thời hạn đình chỉ của gian hàng "${shop.name}" đã kết thúc. Gian hàng đã hoạt động trở lại bình thường.`,
      link: '/settings',
    });
  }
}
