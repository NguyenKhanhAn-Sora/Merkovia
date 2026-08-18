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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  async list(page = 1, limit = 50, q?: string) {
    const term = q?.trim();
    // Tìm 1 ô duy nhất quét cả 4 trường — admin thường chỉ nhớ MỘT trong số
    // "ai làm", "làm gì", "trên cái gì", hoặc "chi tiết ra sao", không chắc
    // trường nào, nên gộp $or thay vì bắt chọn đúng trường trước.
    const filter = term
      ? {
          $or: [
            { adminEmail: { $regex: escapeRegex(term), $options: 'i' } },
            { action: { $regex: escapeRegex(term), $options: 'i' } },
            { targetLabel: { $regex: escapeRegex(term), $options: 'i' } },
            { detail: { $regex: escapeRegex(term), $options: 'i' } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      // Không tìm kiếm gì (filter rỗng) thì dùng ước lượng từ metadata collection
      // thay vì COLLSCAN đếm thật — nhật ký hoạt động phình liên tục, số này chỉ
      // để tham khảo chứ không quyết định logic gì.
      term ? this.model.countDocuments(filter) : this.model.estimatedDocumentCount(),
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
