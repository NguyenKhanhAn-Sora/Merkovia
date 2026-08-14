import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PriceHistory, PriceHistoryDocument } from './schemas/price-history.schema';

/** Cửa sổ nhìn lại để tìm giá tham chiếu. */
const LOOKBACK_DAYS = 30;

/** Đổi giá trong khoảng này trước khi đặt sale mới coi là "vừa xảy ra". */
const GRACE_HOURS = 48;

export interface PriceHikeReference {
  /** Giá thấp nhất từng có TRƯỚC lần đổi giá gần nhất, trong `LOOKBACK_DAYS` ngày. */
  referenceLow: number;
  latestPrice: number;
  latestChangeAt: Date;
}

/**
 * Lịch sử `priceMin` của sản phẩm — nền tảng để `PromotionsService` phát hiện
 * việc shop tăng giá ngay trước khi đặt khuyến mãi nhằm tạo % giảm giá ảo.
 */
@Injectable()
export class PriceHistoryService {
  private readonly logger = new Logger(PriceHistoryService.name);

  constructor(
    @InjectModel(PriceHistory.name)
    private readonly model: Model<PriceHistoryDocument>,
  ) {}

  /**
   * Ghi một mốc giá mới — chỉ gọi khi `priceMin` THỰC SỰ đổi (gọi vô điều
   * kiện mỗi lần sửa sản phẩm sẽ tạo rác vô nghĩa). Không bao giờ ném lỗi ra
   * ngoài — cùng triết lý với `NotificationsService`/`AuditLogService`: ghi
   * log hỏng không được phép làm hỏng việc lưu sản phẩm.
   */
  async record(productId: Types.ObjectId, priceMin: number): Promise<void> {
    try {
      await this.model.create({ product: productId, priceMin });
    } catch (err: unknown) {
      this.logger.warn(`Không ghi được lịch sử giá: ${String(err)}`);
    }
  }

  /**
   * Tìm giá tham chiếu để xét khuyến mãi có đáng ngờ hay không.
   *
   * Trả về `null` khi KHÔNG ĐỦ DỮ LIỆU để kết luận — thà bỏ sót một khuyến
   * mãi ảo còn hơn nghi oan một đợt sale thật:
   *  - Không có lần đổi giá nào trong `GRACE_HOURS` gần đây → không có gì
   *    "vừa xảy ra" để đáng nghi.
   *  - Không có lịch sử giá nào TRƯỚC lần đổi gần nhất trong `LOOKBACK_DAYS`
   *    ngày → sản phẩm còn quá mới, chưa đủ nền để so sánh.
   */
  async findPreHikeReference(
    productId: Types.ObjectId,
  ): Promise<PriceHikeReference | null> {
    const now = Date.now();
    const graceCutoff = new Date(now - GRACE_HOURS * 3_600_000);
    const lookbackCutoff = new Date(now - LOOKBACK_DAYS * 86_400_000);

    const entries = await this.model
      .find({ product: productId, createdAt: { $gte: lookbackCutoff } })
      .sort({ createdAt: -1 })
      .select('priceMin createdAt')
      .lean();
    if (entries.length === 0) return null;

    const latest = entries[0] as unknown as { priceMin: number; createdAt: Date };
    if (latest.createdAt < graceCutoff) return null;

    const reference = entries.filter(
      (e) => (e as unknown as { createdAt: Date }).createdAt < graceCutoff,
    );
    if (reference.length === 0) return null;

    return {
      referenceLow: Math.min(...reference.map((e) => e.priceMin)),
      latestPrice: latest.priceMin,
      latestChangeAt: latest.createdAt,
    };
  }
}
