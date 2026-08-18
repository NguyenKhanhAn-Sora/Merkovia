import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { config } from '../config/config';
import { Product, ProductDocument } from './schemas/product.schema';
import {
  ModerationLog,
  ModerationLogDocument,
} from './schemas/moderation-log.schema';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';

/** Tối đa số ảnh gửi cho AI mỗi lượt xét — vừa đủ để nhận diện vi phạm, vừa giữ chi phí/độ trễ trong tầm. */
const MAX_IMAGES_FOR_REVIEW = 4;

interface GeminiVerdict {
  approved: boolean;
  reason: string;
}

/**
 * Kiểm duyệt sản phẩm bằng AI TRƯỚC KHI hiển thị công khai, cộng hàng đợi cho
 * admin xem/ghi đè. `ProductsService` chỉ gọi `queueReview()` — mọi logic gọi
 * Gemini, đọc/ghi `moderation`, ghi `ModerationLog`, và báo cho seller đều nằm
 * ở đây để tách bạch khỏi CRUD sản phẩm thông thường (giống cách
 * `ShopSuspensionService` tách khỏi `ShopReportsService`).
 *
 * 🔴 FAIL-SAFE: bất kỳ lỗi nào khi gọi AI (thiếu khoá, mất mạng, JSON không
 * đọc được) đều KHÔNG được tự ý duyệt hay từ chối — sản phẩm giữ nguyên
 * `pending` (vẫn ẩn khỏi buyer) và rơi vào hàng đợi cho admin xử lý tay. Không
 * bao giờ để lỗi hạ tầng làm sản phẩm vi phạm lọt qua kiểm duyệt.
 */
@Injectable()
export class ProductModerationService {
  private readonly logger = new Logger(ProductModerationService.name);
  private readonly timeoutMs = 20_000;
  private readonly imageFetchTimeoutMs = 8_000;

  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(ModerationLog.name)
    private readonly logModel: Model<ModerationLogDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    private readonly notifications: NotificationsService,
    private readonly auditLog: AuditLogService,
  ) {}

  private isEnabled(): boolean {
    return !!config.gemini.apiKey;
  }

  /**
   * Bắn rồi quên — gọi ngay sau khi lưu sản phẩm, KHÔNG chặn response của
   * seller. Sản phẩm đã được đặt `moderation.state = 'pending'` trước đó nên
   * dù job này chạy chậm hay lỗi, sản phẩm vẫn ẩn khỏi buyer một cách an toàn.
   */
  queueReview(productId: Types.ObjectId | string): void {
    const id = String(productId);
    void this.review(id).catch((err) => {
      this.logger.error(
        `Kiểm duyệt sản phẩm ${id} lỗi ngoài dự kiến: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  private async review(productId: string): Promise<void> {
    if (!this.isEnabled()) {
      await this.recordError(
        productId,
        'Chưa cấu hình GEMINI_API_KEY — cần admin duyệt tay.',
      );
      return;
    }

    const product = await this.productModel
      .findById(productId)
      .populate<{ category?: { name?: string } }>('category', 'name')
      .lean();
    if (!product) return;

    try {
      const verdict = await this.callGemini(product);
      await this.applyVerdict(
        product._id,
        product.shop,
        verdict.approved ? 'approve' : 'reject',
        verdict.reason,
        'ai',
        { aiModel: config.gemini.moderationModel },
      );
    } catch (err) {
      this.logger.warn(
        `Gemini kiểm duyệt sản phẩm ${productId} lỗi: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await this.recordError(
        productId,
        'AI kiểm duyệt gặp lỗi khi xử lý — cần admin duyệt tay.',
      );
    }
  }

  /** Ghi một dòng lỗi vào lịch sử — KHÔNG đụng vào `moderation.state` (vẫn giữ `pending`). */
  private async recordError(productId: string, reason: string): Promise<void> {
    const product = await this.productModel
      .findById(productId)
      .select('shop')
      .lean();
    if (!product) return;
    await this.logModel.create({
      product: product._id,
      shop: product.shop,
      verdict: 'error',
      reason,
      decidedBy: 'ai',
      aiModel: config.gemini.moderationModel,
    });
  }

  /* ------------------------------ Gọi Gemini ------------------------------ */

  private async fetchImageParts(
    urls: string[],
  ): Promise<{ inlineData: { mimeType: string; data: string } }[]> {
    const picked = urls.slice(0, MAX_IMAGES_FOR_REVIEW);
    const results = await Promise.all(
      picked.map(async (url) => {
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          this.imageFetchTimeoutMs,
        );
        try {
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) return null;
          const mimeType = res.headers.get('content-type') || 'image/jpeg';
          const buf = Buffer.from(await res.arrayBuffer());
          return { inlineData: { mimeType, data: buf.toString('base64') } };
        } catch {
          return null;
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    return results.filter(
      (r): r is { inlineData: { mimeType: string; data: string } } => !!r,
    );
  }

  /** Ảnh chung trước, không có thì lấy tạm vài ảnh phân loại — giống quy tắc hiển thị ở `listMine`. */
  private collectImageUrls(product: {
    images?: { url: string }[];
    variants?: { image?: string }[];
  }): string[] {
    if (product.images?.length) return product.images.map((i) => i.url);
    return (product.variants ?? [])
      .map((v) => v.image)
      .filter((u): u is string => !!u);
  }

  private buildPrompt(product: {
    name: string;
    description?: string;
    category?: { name?: string };
    attributes?: { name: string; value: string }[];
  }): string {
    const attrs = (product.attributes ?? [])
      .map((a) => `${a.name}: ${a.value}`)
      .join('; ');
    return `Bạn là kiểm duyệt viên nội dung cho một sàn thương mại điện tử. Xét duyệt sản phẩm sau dựa trên thông tin văn bản và các ảnh đính kèm.

Tên sản phẩm: ${product.name}
Ngành hàng: ${product.category?.name ?? '(không rõ)'}
Mô tả: ${product.description || '(không có)'}
Thuộc tính: ${attrs || '(không có)'}

Hãy kiểm tra:
1. Ảnh có khớp với tên/mô tả sản phẩm không (không phải ảnh linh tinh, ảnh sai sản phẩm).
2. Sản phẩm có đúng ngành hàng đã chọn không.
3. Tên/mô tả/thuộc tính có ngôn từ không phù hợp (tục tĩu, phân biệt, lừa đảo, quảng cáo y tế/dược trái phép) không.
4. Ảnh có vi phạm chính sách không (khoả thân, bạo lực, vũ khí, chất cấm, hàng giả/nhái nhãn hiệu).
5. Các thông tin có nhất quán với nhau không.

Nếu có bất kỳ vi phạm nào ở trên, từ chối. Chỉ duyệt khi không có vấn đề gì đáng ngại.
Trả lời bằng tiếng Việt, ngắn gọn, đúng định dạng JSON yêu cầu. Nếu duyệt (approved=true) thì "reason" để trống.`;
  }

  private async callGemini(product: {
    name: string;
    description?: string;
    category?: { name?: string };
    attributes?: { name: string; value: string }[];
    images?: { url: string }[];
    variants?: { image?: string }[];
  }): Promise<GeminiVerdict> {
    const imageParts = await this.fetchImageParts(
      this.collectImageUrls(product),
    );
    const parts: unknown[] = [
      { text: this.buildPrompt(product) },
      ...imageParts,
    ];

    const url =
      `${config.gemini.baseUrl}/models/${config.gemini.moderationModel}:generateContent` +
      `?key=${config.gemini.apiKey}`;
    const body = {
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            approved: { type: 'BOOLEAN' },
            reason: { type: 'STRING' },
          },
          required: ['approved', 'reason'],
        },
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Gemini HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini không trả về nội dung');
      const parsed = JSON.parse(text) as Partial<GeminiVerdict>;
      if (typeof parsed.approved !== 'boolean') {
        throw new Error('Gemini trả về định dạng không hợp lệ');
      }
      return { approved: parsed.approved, reason: parsed.reason ?? '' };
    } finally {
      clearTimeout(timer);
    }
  }

  /* -------------------------------- Ghi quyết định ------------------------------- */

  private async applyVerdict(
    productId: Types.ObjectId,
    shopId: Types.ObjectId,
    verdict: 'approve' | 'reject',
    reason: string | undefined,
    decidedBy: 'ai' | 'admin',
    extra: { aiModel?: string; adminEmail?: string },
  ): Promise<void> {
    const state = verdict === 'approve' ? 'ok' : 'rejected';
    await this.productModel.updateOne(
      { _id: productId },
      {
        $set: {
          moderation: {
            state,
            reason: verdict === 'reject' ? reason || undefined : undefined,
            reviewedAt: new Date(),
            reviewedBy: decidedBy,
          },
        },
      },
    );
    await this.logModel.create({
      product: productId,
      shop: shopId,
      verdict,
      reason: reason || undefined,
      decidedBy,
      aiModel: extra.aiModel,
      adminEmail: extra.adminEmail,
    });
    await this.notifySeller(shopId, verdict, reason);
  }

  private async notifySeller(
    shopId: Types.ObjectId,
    verdict: 'approve' | 'reject',
    reason?: string,
  ): Promise<void> {
    const shop = await this.shopModel
      .findById(shopId)
      .select('owner name')
      .lean();
    if (!shop) return;
    if (verdict === 'approve') {
      await this.notifications.notifyUser(shop.owner, 'seller', {
        type: 'product_approved',
        title: 'Sản phẩm đã được duyệt',
        body: 'Sản phẩm của bạn đã qua kiểm duyệt và đang hiển thị trên sàn.',
        link: '/products',
      });
    } else {
      await this.notifications.notifyUser(shop.owner, 'seller', {
        type: 'product_rejected',
        title: 'Sản phẩm bị từ chối duyệt',
        body: reason
          ? `Sản phẩm chưa đạt yêu cầu kiểm duyệt: ${reason}`
          : 'Sản phẩm chưa đạt yêu cầu kiểm duyệt. Vui lòng xem chi tiết và đăng lại.',
        link: '/products',
      });
    }
  }

  /* -------------------------------- Trang admin -------------------------------- */

  async adminList(query: {
    tab?: 'pending' | 'rejected' | 'ok' | 'all';
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const tab = query.tab ?? 'pending';
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const filter: Record<string, unknown> = {
      deletedAt: null,
      ...(tab !== 'all' ? { 'moderation.state': tab } : {}),
    };
    if (query.q?.trim()) {
      const rx = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.name = { $regex: rx, $options: 'i' };
    }

    // Hàng chờ xử lý xếp cũ nhất trước (FIFO) — các tab còn lại xem mới nhất trước.
    const sort: Record<string, 1 | -1> =
      tab === 'pending' ? { updatedAt: 1 } : { updatedAt: -1 };

    const [items, total, counts] = await Promise.all([
      this.productModel
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('shop', 'name slug')
        .populate('category', 'name')
        .lean(),
      this.productModel.countDocuments(filter),
      this.countByModerationState(),
    ]);

    return {
      items: items.map((p) => ({
        id: String(p._id),
        name: p.name,
        image: p.images?.[0]?.url ?? p.variants?.find((v) => v.image)?.image,
        shop: p.shop as unknown as { name: string; slug: string },
        category: (p.category as unknown as { name?: string })?.name,
        priceMin: p.priceMin,
        status: p.status,
        moderation: p.moderation,
        updatedAt: (p as { updatedAt?: Date }).updatedAt,
      })),
      total,
      page,
      limit,
      counts,
    };
  }

  private async countByModerationState() {
    const [pending, rejected, ok] = await Promise.all([
      this.productModel.countDocuments({
        deletedAt: null,
        'moderation.state': 'pending',
      }),
      this.productModel.countDocuments({
        deletedAt: null,
        'moderation.state': 'rejected',
      }),
      this.productModel.countDocuments({
        deletedAt: null,
        'moderation.state': 'ok',
      }),
    ]);
    return { pending, rejected, ok, all: pending + rejected + ok };
  }

  async adminDetail(productId: string) {
    if (!Types.ObjectId.isValid(productId)) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }
    const [product, logs] = await Promise.all([
      this.productModel
        .findById(productId)
        .populate('shop', 'name slug status')
        .populate('category', 'name')
        .lean(),
      this.logModel.find({ product: productId }).sort({ createdAt: 1 }).lean(),
    ]);
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm.');

    return {
      product,
      logs: logs.map((l) => ({
        id: String(l._id),
        verdict: l.verdict,
        reason: l.reason,
        decidedBy: l.decidedBy,
        aiModel: l.aiModel,
        adminEmail: l.adminEmail,
        createdAt: (l as { createdAt?: Date }).createdAt,
      })),
    };
  }

  /** Admin duyệt/từ chối tay — dùng được bất cứ lúc nào, kể cả ghi đè quyết định AI. */
  async adminModerate(
    admin: AdminPrincipal,
    productId: string,
    action: 'approve' | 'reject',
    reason?: string,
  ) {
    if (!Types.ObjectId.isValid(productId)) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }
    if (action === 'reject' && (reason?.trim().length ?? 0) < 5) {
      throw new BadRequestException(
        'Lý do từ chối cần ít nhất 5 ký tự — đây sẽ là thông báo gửi thẳng cho người bán.',
      );
    }
    const product = await this.productModel
      .findById(productId)
      .select('shop name')
      .lean();
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm.');

    await this.applyVerdict(
      product._id,
      product.shop,
      action,
      reason?.trim(),
      'admin',
      { adminEmail: admin.email },
    );
    await this.auditLog.log({
      adminEmail: admin.email,
      action:
        action === 'approve'
          ? 'Duyệt sản phẩm (tay)'
          : 'Từ chối sản phẩm (tay)',
      targetLabel: product.name,
      detail: reason?.trim(),
    });
    return { ok: true };
  }
}
