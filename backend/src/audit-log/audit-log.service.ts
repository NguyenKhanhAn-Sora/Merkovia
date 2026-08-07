import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

export interface AuditLogEntry {
  adminEmail: string;
  action: string;
  targetLabel?: string;
  detail?: string;
}

/**
 * Ghi/đọc nhật ký thao tác admin. Các service nghiệp vụ (shop-reports, orders,
 * products...) gọi `log()` ngay sau khi hành động ĐÃ thành công.
 *
 * 🔴 KHÔNG BAO GIỜ ném lỗi ra ngoài — cùng triết lý với `NotificationsService`:
 * ghi log hỏng không được phép làm hỏng thao tác nghiệp vụ chính đã xong việc.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly model: Model<AuditLogDocument>,
  ) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.model.create(entry);
    } catch (e: unknown) {
      this.logger.warn(`Ghi audit log thất bại: ${String(e)}`);
    }
  }

  async list(page = 1, limit = 50) {
    const [items, total] = await Promise.all([
      this.model
        .find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.model.countDocuments(),
    ]);
    return {
      items: items.map((l) => ({
        id: String(l._id),
        adminEmail: l.adminEmail,
        action: l.action,
        targetLabel: l.targetLabel,
        detail: l.detail,
        createdAt: (l as { createdAt?: Date }).createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  /** N dòng gần nhất — dùng cho "Hoạt động gần đây" ở trang Tổng quan. */
  async recent(limit = 6) {
    const items = await this.model
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return items.map((l) => ({
      id: String(l._id),
      action: l.action,
      targetLabel: l.targetLabel,
      createdAt: (l as { createdAt?: Date }).createdAt,
    }));
  }
}
