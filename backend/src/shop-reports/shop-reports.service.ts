import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ShopReport,
  ShopReportDocument,
  REPORT_SEVERITY,
  REPORT_REASON_LABEL_VI,
  ReportReason,
} from './schemas/shop-report.schema';
import {
  CreateShopReportDto,
  ResolveShopReportDto,
} from './dto/shop-report.dto';
import { Shop, ShopDocument } from '../shops/schemas/shop.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Review, ReviewDocument } from '../reviews/schemas/review.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../auth/mail.service';
import { ShopSuspensionService } from './shop-suspension.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { AdminPrincipal } from '../admin-auth/admin-auth.service';
import { config } from '../config/config';

const QUEUE_SCAN_LIMIT = 1000;

/** Một dòng trong hàng đợi ưu tiên xử lý — gộp mọi báo cáo `pending` của một shop. */
export interface ReportQueueItem {
  shopId: string;
  shopName: string;
  shopSlug?: string;
  shopStatus: string;
  /** Số người báo cáo KHÁC NHAU còn đang chờ — mỗi người chỉ tính một lần (xem `priorityQueue`). */
  reportCount: number;
  reasons: string[];
  /** Tổng điểm ưu tiên = Σ (trọng số mức nghiêm trọng × độ tin cậy người báo) — xem `priorityQueue`. */
  score: number;
  tier: 'urgent' | 'high' | 'medium' | 'low';
  oldestReportAt: Date;
  latestReportAt: Date;
}

/** Một dòng trong lịch sử xử lý — một shop từng bị xử lý, kèm quyết định gần nhất. */
export interface ReportHistoryItem {
  shopId: string;
  shopName: string;
  shopSlug?: string;
  shopStatus: string;
  suspendedUntil?: Date | null;
  lastAction: 'warning' | 'suspend' | 'dismiss';
  lastActionNote?: string;
  lastActionAt: Date;
  lastActionBy: string;
  /** Tổng số báo cáo (mọi trạng thái, mọi thời điểm) shop này từng nhận. */
  totalReports: number;
}

/** Đơn hàng liên quan tới MỘT báo cáo — ngữ cảnh để admin đối chiếu, không phải để phân quyền. */
export interface ReportOrderContext {
  id: string;
  orderCode: string;
  status: string;
  total: number;
  createdAt: Date;
  items: {
    name: string;
    variantLabel?: string;
    quantity: number;
    price: number;
  }[];
}

/**
 * Hồ sơ vận hành của MỘT shop — CƠ SỞ để admin đánh giá "shop này có đáng
 * ngờ không" ngoài lời tố cáo của một mình người báo cáo. Chỉ chọn những số
 * liệu THỰC SỰ nói lên hành vi (tỉ lệ huỷ/trả hàng, đánh giá, tiền án) — cố
 * tình KHÔNG đưa mô tả/logo/địa chỉ kho/lịch sử đổi tên... vào đây vì chúng
 * không giúp trả lời câu hỏi "có vi phạm hay không".
 */
export interface ShopProfile {
  createdAt: Date;
  businessType: string;
  /** Có mã số thuế/GPKD hay không — hộ KD/doanh nghiệp có mức chịu trách nhiệm pháp lý cao hơn cá nhân. */
  hasTaxCode: boolean;
  totalOrders: number;
  /** Tỉ lệ đơn CHÍNH shop huỷ (0..1) — cao bất thường là dấu hiệu hết hàng ảo/không giao được hàng. */
  sellerCancelRate: number;
  /** Tỉ lệ đơn bị trả hàng (0..1) — cao bất thường là dấu hiệu hàng không đúng mô tả/kém chất lượng. */
  returnRate: number;
  ratingAvg: number;
  ratingCount: number;
  /** Số LẦN admin từng cảnh cáo shop này (đếm theo lượt xử lý, không đếm theo số báo cáo). */
  pastWarnings: number;
  /** Số LẦN admin từng đình chỉ shop này. */
  pastSuspensions: number;
  activeProductCount: number;
  /** Sản phẩm từng bị từ chối duyệt — dấu hiệu cố ý đăng nội dung vi phạm. */
  rejectedProductCount: number;
}

/** Độ tin cậy của MỘT người báo cáo — nhân vào điểm, không dùng để chặn quyền báo cáo. */
type TrustTier = 'low' | 'regular' | 'trusted';
interface TrustInfo {
  weight: number;
  tier: TrustTier;
}

/**
 * Trọng số mức nghiêm trọng theo lý do — đầu vào của điểm ưu tiên. Tách biệt
 * với `REPORT_SEVERITY` (chỉ phân loại high/medium/low) để có thể tinh chỉnh
 * độ dốc giữa các mức mà không đổi cách phân loại.
 */
const SEVERITY_WEIGHT = { high: 3, medium: 1.6, low: 0.8 } as const;

/**
 * Trọng số độ tin cậy người báo cáo — nhân vào mức nghiêm trọng khi tính điểm.
 * KHÔNG dùng để chặn quyền báo cáo (ai cũng báo cáo được), chỉ ảnh hưởng báo
 * cáo đó góp bao nhiêu vào điểm số của shop. Mục đích: một tài khoản đơn lẻ,
 * mới tạo, chưa từng mua hàng không thể một mình đẩy một shop lên mức "khẩn
 * cấp" chỉ bằng một lời tố cáo chưa có gì kiểm chứng — quy mô càng lớn, rủi ro
 * report giả/report để triệt hạ đối thủ càng cao, nên độ tin cậy PHẢI là một
 * phần của công thức, không chỉ dựa vào lý do + số lượng thô.
 */
const TRUST_BASE = 1;
const TRUST_AGE_FULL_DAYS = 180; // đủ 180 ngày tuổi tài khoản mới cộng tối đa
const TRUST_AGE_MAX_BONUS = 0.3;
const TRUST_VERIFIED_BONUS = 0.15; // đã xác thực email hoặc SĐT
const TRUST_NO_PURCHASE_PENALTY = -0.3; // chưa từng có đơn giao thành công
const TRUST_PURCHASE_BONUS = 0.2; // đã có đơn giao thành công
const TRUST_PURCHASE_BONUS_ACTIVE = 0.35; // >= 5 đơn giao thành công — khách quen
const TRUST_ACTIVE_ORDER_THRESHOLD = 5;
// Lịch sử báo cáo CŨ (đã xử lý) của chính người này — tỉ lệ báo cáo dẫn tới
// hành động thật (resolved) so với bị bỏ qua (dismissed) kéo trọng số lên/xuống.
// Cần đủ mẫu tối thiểu mới tính, tránh một báo cáo đầu tiên bị từ chối oan đã
// dìm điểm người dùng.
const TRUST_TRACK_RECORD_MIN_SAMPLES = 2;
const TRUST_TRACK_RECORD_SCALE = 1.2; // tỉ lệ 100% chính xác -> +0.6, 0% -> -0.6
const TRUST_MIN = 0.25;
const TRUST_MAX = 1.8;

@Injectable()
export class ShopReportsService {
  private readonly logger = new Logger(ShopReportsService.name);

  constructor(
    @InjectModel(ShopReport.name)
    private readonly reportModel: Model<ShopReportDocument>,
    @InjectModel(Shop.name) private readonly shopModel: Model<ShopDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly suspension: ShopSuspensionService,
    private readonly auditLog: AuditLogService,
  ) {}

  /* -------------------------------- Người mua ------------------------------- */

  async create(user: UserDocument, dto: CreateShopReportDto) {
    if (!Types.ObjectId.isValid(dto.shopId)) {
      throw new BadRequestException('Gian hàng không hợp lệ.');
    }
    const shop = await this.shopModel
      .findById(dto.shopId)
      .select('owner')
      .lean();
    if (!shop) throw new NotFoundException('Không tìm thấy gian hàng.');
    if (String(shop.owner) === String(user._id)) {
      throw new ForbiddenException(
        'Bạn không thể báo cáo chính gian hàng của mình.',
      );
    }

    // Đơn kèm theo (nếu có) phải đúng là của người gửi VÀ đúng shop đang báo cáo —
    // chặn giả mạo ngữ cảnh để tăng độ tin cậy cho admin.
    let orderId: Types.ObjectId | undefined;
    if (dto.orderId) {
      if (!Types.ObjectId.isValid(dto.orderId)) {
        throw new BadRequestException('Đơn hàng không hợp lệ.');
      }
      // 🔴 `shop` PHẢI là ObjectId thật, không phải chuỗi: field này bị lỗi
      // Mixed-type kinh niên của cả codebase (xem memory `merkovia-objectid-
      // gotcha`) nên Mongoose không tự ép kiểu — so sánh với chuỗi sẽ luôn
      // trượt dù đúng shop, khiến ngữ cảnh đơn hàng bị âm thầm rớt mất.
      const order = await this.orderModel
        .findOne({
          _id: dto.orderId,
          buyer: user._id,
          shop: new Types.ObjectId(dto.shopId),
        })
        .select('_id')
        .lean();
      if (order) orderId = order._id;
    }

    // Chặn spam: đã có báo cáo đang chờ cho shop này thì không gửi thêm cái mới.
    const dup = await this.reportModel.exists({
      reporter: user._id,
      shop: dto.shopId,
      status: 'pending',
    });
    if (dup) {
      throw new BadRequestException(
        'Bạn đã gửi báo cáo cho gian hàng này và đang chờ xử lý.',
      );
    }

    const evidence = (dto.evidence ?? []).map((e) => ({
      kind: e.kind as 'image' | 'video',
      url: e.url.trim(),
      key: e.key?.trim(),
    }));

    await this.reportModel.create({
      reporter: user._id,
      shop: dto.shopId,
      reasonType: dto.reasonType,
      detail: dto.detail?.trim() || undefined,
      order: orderId,
      evidence,
      status: 'pending',
    });
    return { ok: true };
  }

  /* --------------------------------- Admin ---------------------------------- */

  /**
   * Hàng đợi ưu tiên: gộp báo cáo `pending` theo shop, không liệt kê phẳng —
   * nhiều người cùng báo một shop chỉ chiếm MỘT dòng (kèm số lượng), tránh
   * loãng hàng đợi khi một shop bị báo cáo dồn dập.
   *
   * Xếp theo ĐIỂM (không phải chỉ lý do/số lượng thô): điểm = tổng
   * (trọng số mức nghiêm trọng × độ tin cậy người báo) trên MỖI NGƯỜI BÁO CÁO
   * KHÁC NHAU của shop đó. Vì sao không chỉ dựa lý do/số lượng: một tài khoản
   * đơn lẻ, mới tạo, chưa từng mua hàng, chỉ cần chọn lý do nặng là đẩy ngay
   * một shop lên mức khẩn cấp — không ổn khi hệ thống lớn hơn (dễ bị lợi dụng
   * để hại đối thủ). Ngưỡng điểm nằm ở `config.reports.*`.
   *
   * Mỗi người báo cáo chỉ đóng góp ĐÚNG MỘT LẦN — báo cáo MỚI NHẤT của họ —
   * dù về sau có báo cáo lại nhiều lần cho cùng shop (được phép re-file sau
   * khi báo cáo trước đã bị xử lý). `create()` đã chặn 2 báo cáo `pending`
   * cùng lúc từ 1 người, đây là lớp phòng vệ THỨ HAI ở tầng tính điểm, không
   * phụ thuộc hoàn toàn vào ràng buộc lúc ghi.
   */
  async priorityQueue(): Promise<ReportQueueItem[]> {
    const reports = await this.reportModel
      .find({ status: 'pending' })
      .sort({ createdAt: 1 })
      .limit(QUEUE_SCAN_LIMIT)
      .select('shop reporter reasonType createdAt')
      .lean();
    if (reports.length === 0) return [];

    // shopId -> reporterId -> báo cáo MỚI NHẤT của người đó cho shop này.
    const byShop = new Map<
      string,
      Map<string, { reasonType: ReportReason; createdAt: Date }>
    >();
    for (const r of reports) {
      const shopKey = String(r.shop);
      const reporterKey = String(r.reporter);
      const createdAt = (r as unknown as { createdAt: Date }).createdAt;
      let reporters = byShop.get(shopKey);
      if (!reporters) {
        reporters = new Map();
        byShop.set(shopKey, reporters);
      }
      const existing = reporters.get(reporterKey);
      if (!existing || createdAt > existing.createdAt) {
        reporters.set(reporterKey, { reasonType: r.reasonType, createdAt });
      }
    }

    const allReporterIds = [...new Set(reports.map((r) => String(r.reporter)))];
    const trustMap = await this.computeTrustScores(allReporterIds);

    const shopIds = [...byShop.keys()];
    const shops = await this.shopModel
      .find({ _id: { $in: shopIds } })
      .select('name slug status')
      .lean();
    const shopById = new Map(shops.map((s) => [String(s._id), s]));

    const items: ReportQueueItem[] = [];
    for (const shopId of shopIds) {
      const shop = shopById.get(shopId);
      if (!shop) continue; // shop đã bị xoá — không còn gì để xử lý.

      const reportersMap = byShop.get(shopId)!;
      let score = 0;
      let oldest: Date | undefined;
      let latest: Date | undefined;
      const reasonsSet = new Set<string>();
      for (const [reporterId, rep] of reportersMap) {
        const trust = trustMap.get(reporterId);
        const weight = trust?.weight ?? TRUST_BASE;
        score += SEVERITY_WEIGHT[REPORT_SEVERITY[rep.reasonType]] * weight;
        reasonsSet.add(rep.reasonType);
        if (!oldest || rep.createdAt < oldest) oldest = rep.createdAt;
        if (!latest || rep.createdAt > latest) latest = rep.createdAt;
      }

      const tier: ReportQueueItem['tier'] =
        score >= config.reports.urgentScore
          ? 'urgent'
          : score >= config.reports.highScore
            ? 'high'
            : score >= config.reports.mediumScore
              ? 'medium'
              : 'low';

      items.push({
        shopId,
        shopName: shop.name,
        shopSlug: shop.slug,
        shopStatus: shop.status,
        reportCount: reportersMap.size,
        reasons: [...reasonsSet],
        score: Math.round(score * 10) / 10,
        tier,
        oldestReportAt: oldest!,
        latestReportAt: latest!,
      });
    }

    items.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.oldestReportAt.getTime() - b.oldestReportAt.getTime();
    });
    return items;
  }

  /**
   * Lịch sử xử lý — shop từng có báo cáo được admin xử lý (`resolved`/`dismissed`),
   * mỗi shop một dòng với quyết định GẦN NHẤT, mới nhất lên trước.
   *
   * 🔴 Đây là lối vào DUY NHẤT để mở lại một shop đã hết báo cáo `pending` —
   * `priorityQueue()` chỉ liệt kê shop còn báo cáo đang chờ, nên một shop bị
   * đình chỉ VÔ THỜI HẠN rồi biến mất khỏi hàng đợi (không còn gì đang chờ) sẽ
   * không còn cách nào gỡ đình chỉ nếu thiếu trang này — admin cần tìm lại nó
   * ở đây để mở khay chi tiết (có sẵn nút "Gỡ đình chỉ ngay").
   */
  async resolvedHistory(): Promise<ReportHistoryItem[]> {
    const reports = await this.reportModel
      .find({ status: { $in: ['resolved', 'dismissed'] } })
      .sort({ 'resolution.resolvedAt': -1 })
      .limit(QUEUE_SCAN_LIMIT)
      .select('shop resolution')
      .lean();
    if (reports.length === 0) return [];

    // Giữ QUYẾT ĐỊNH GẦN NHẤT của mỗi shop — đã sort mới-nhất-trước nên bản
    // ghi đầu tiên gặp cho mỗi shop chính là bản mới nhất.
    const latestByShop = new Map<
      string,
      NonNullable<(typeof reports)[number]['resolution']>
    >();
    for (const r of reports) {
      const key = String(r.shop);
      if (!latestByShop.has(key) && r.resolution)
        latestByShop.set(key, r.resolution);
    }
    const shopIds = [...latestByShop.keys()];

    const [shops, totalCounts] = await Promise.all([
      this.shopModel
        .find({ _id: { $in: shopIds } })
        .select('name slug status suspendedUntil')
        .lean(),
      this.reportModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: {
            shop: { $in: shopIds.map((id) => new Types.ObjectId(id)) },
          },
        },
        { $group: { _id: '$shop', count: { $sum: 1 } } },
      ]),
    ]);
    const shopById = new Map(shops.map((s) => [String(s._id), s]));
    const totalByShop = new Map(
      totalCounts.map((c) => [String(c._id), c.count]),
    );

    return shopIds
      .filter((id) => shopById.has(id))
      .map((shopId) => {
        const shop = shopById.get(shopId)!;
        const resolution = latestByShop.get(shopId)!;
        const item: ReportHistoryItem = {
          shopId,
          shopName: shop.name,
          shopSlug: shop.slug,
          shopStatus: shop.status,
          suspendedUntil: shop.suspendedUntil,
          lastAction: resolution.action,
          lastActionNote: resolution.note,
          lastActionAt: resolution.resolvedAt,
          lastActionBy: resolution.resolvedBy,
          totalReports: totalByShop.get(shopId) ?? 0,
        };
        return item;
      })
      .sort((a, b) => b.lastActionAt.getTime() - a.lastActionAt.getTime());
  }

  /**
   * Danh sách từng báo cáo (mọi trạng thái) của một shop — cho khay chi tiết.
   * Kèm 3 thứ giúp admin xác nhận vi phạm thay vì chỉ đọc một dòng lý do:
   * bằng chứng ảnh/video người báo cáo gửi, ngữ cảnh đơn hàng liên quan (nếu
   * có), và hồ sơ vận hành tổng thể của shop (xem `computeShopProfile`).
   */
  async listForShop(shopId: string) {
    if (!Types.ObjectId.isValid(shopId)) {
      throw new BadRequestException('Gian hàng không hợp lệ.');
    }
    const [shop, reports, shopProfile] = await Promise.all([
      this.shopModel
        .findById(shopId)
        .select('name slug status suspendedUntil')
        .lean(),
      this.reportModel
        .find({ shop: shopId })
        .sort({ createdAt: -1 })
        .limit(200)
        .populate<{
          reporter: { _id: Types.ObjectId; email?: string; phone?: string };
        }>('reporter', 'email phone')
        .lean(),
      this.computeShopProfile(shopId),
    ]);
    if (!shop) throw new NotFoundException('Không tìm thấy gian hàng.');

    // Độ tin cậy từng người báo cáo — hiển thị kèm để admin cân nhắc, KHÔNG
    // dùng để tự động loại báo cáo nào (quyết định cuối vẫn là của admin).
    const reporterIds = [
      ...new Set(reports.map((r) => String(r.reporter?._id ?? r.reporter))),
    ];
    const trustMap = await this.computeTrustScores(reporterIds);

    // Đơn hàng liên quan — gộp truy vấn MỘT lần cho mọi báo cáo có `order`,
    // không lặp N+1 cho từng báo cáo riêng lẻ.
    const orderIds = [
      ...new Set(reports.filter((r) => r.order).map((r) => String(r.order))),
    ];
    const orderContextById = new Map<string, ReportOrderContext>();
    if (orderIds.length > 0) {
      const orders = await this.orderModel
        .find({ _id: { $in: orderIds } })
        .select('orderCode status total items')
        .lean();
      for (const o of orders) {
        orderContextById.set(String(o._id), {
          id: String(o._id),
          orderCode: o.orderCode,
          status: o.status,
          total: o.total,
          createdAt: (o as unknown as { createdAt: Date }).createdAt,
          items: o.items.map((it) => ({
            name: it.name,
            variantLabel: it.variantLabel || undefined,
            quantity: it.quantity,
            price: it.price,
          })),
        });
      }
    }

    return {
      shop: {
        id: shopId,
        name: shop.name,
        slug: shop.slug,
        status: shop.status,
        suspendedUntil: shop.suspendedUntil,
      },
      shopProfile,
      reports: reports.map((r) => ({
        id: String(r._id),
        reasonType: r.reasonType,
        reasonLabel: REPORT_REASON_LABEL_VI[r.reasonType],
        detail: r.detail,
        status: r.status,
        reporterContact: r.reporter?.email || r.reporter?.phone || '(ẩn danh)',
        reporterTrust:
          trustMap.get(String(r.reporter?._id ?? r.reporter))?.tier ??
          'regular',
        evidence: r.evidence ?? [],
        order: r.order ? orderContextById.get(String(r.order)) : undefined,
        createdAt: (r as unknown as { createdAt: Date }).createdAt,
        resolution: r.resolution
          ? {
              action: r.resolution.action,
              note: r.resolution.note,
              resolvedAt: r.resolution.resolvedAt,
              resolvedBy: r.resolution.resolvedBy,
            }
          : undefined,
      })),
    };
  }

  /**
   * Xử lý MỘT LẦN cho TẤT CẢ báo cáo `pending` của một shop — admin không xử
   * từng báo cáo lẻ vì cùng một shop chỉ có một quyết định (cảnh cáo/đình chỉ/
   * bỏ qua), xử lẻ tẻ chỉ tạo cảm giác đã giải quyết nhưng dữ liệu vẫn rối.
   */
  async resolve(
    admin: AdminPrincipal,
    shopId: string,
    dto: ResolveShopReportDto,
  ) {
    if (!Types.ObjectId.isValid(shopId)) {
      throw new BadRequestException('Gian hàng không hợp lệ.');
    }
    const shop = await this.shopModel
      .findById(shopId)
      .select('owner name status')
      .exec();
    if (!shop) throw new NotFoundException('Không tìm thấy gian hàng.');

    const pending = await this.reportModel.find({
      shop: shopId,
      status: 'pending',
    });
    if (pending.length === 0) {
      throw new BadRequestException(
        'Không còn báo cáo nào đang chờ xử lý cho gian hàng này.',
      );
    }

    const resolvedAt = new Date();
    const resolution = {
      action: dto.action,
      note: dto.note?.trim() || undefined,
      resolvedAt,
      resolvedBy: admin.id,
    };
    const newStatus = dto.action === 'dismiss' ? 'dismissed' : 'resolved';
    await this.reportModel.updateMany(
      { _id: { $in: pending.map((p) => p._id) } },
      { $set: { status: newStatus, resolution } },
    );

    if (dto.action === 'suspend') {
      shop.status = 'suspended';
      // Có `suspendDays` = đình chỉ có hạn, hệ thống tự gỡ (nếu Redis bật).
      // Không có = đình chỉ vô thời hạn — huỷ mọi lịch gỡ cũ (VD: shop này
      // từng bị đình chỉ có hạn trước đó rồi tái phạm, giờ đình chỉ hẳn).
      if (dto.suspendDays) {
        const unsuspendAt = new Date(Date.now() + dto.suspendDays * 86_400_000);
        shop.suspendedUntil = unsuspendAt;
        await shop.save();
        await this.suspension.schedule(shopId, unsuspendAt);
      } else {
        shop.suspendedUntil = null;
        await shop.save();
        await this.suspension.cancel(shopId);
      }
    }

    // `dismiss` = admin thấy không có vi phạm — im lặng, không cần làm phiền
    // shop vì một báo cáo mà chính admin đã xác định là không thoả đáng.
    if (dto.action !== 'dismiss') {
      const reasons = [...new Set(pending.map((p) => p.reasonType))]
        .map((r) => REPORT_REASON_LABEL_VI[r])
        .join(', ');
      await this.notifyShopOfAction(
        shop,
        dto.action,
        reasons,
        resolution.note ?? '',
        dto.action === 'suspend' ? dto.suspendDays : undefined,
      );
    }

    const ACTION_LABEL: Record<typeof dto.action, string> = {
      warning: 'Cảnh cáo gian hàng',
      suspend: 'Đình chỉ gian hàng',
      dismiss: 'Bỏ qua báo cáo',
    };
    await this.auditLog.log({
      adminEmail: admin.email,
      action: ACTION_LABEL[dto.action],
      targetLabel: shop.name,
      detail: `${pending.length} báo cáo${resolution.note ? ` — ${resolution.note}` : ''}`,
    });

    return { ok: true, resolvedCount: pending.length };
  }

  /**
   * Admin gỡ đình chỉ SỚM, trước hạn (hoặc khi đình chỉ vô thời hạn — cách
   * DUY NHẤT để gỡ). Huỷ luôn job tự động đang chờ (nếu có) để không bị gỡ
   * "lần hai" vô nghĩa sau đó.
   */
  async unsuspend(admin: AdminPrincipal, shopId: string) {
    if (!Types.ObjectId.isValid(shopId)) {
      throw new BadRequestException('Gian hàng không hợp lệ.');
    }
    const shop = await this.shopModel.findById(shopId).exec();
    if (!shop) throw new NotFoundException('Không tìm thấy gian hàng.');
    if (shop.status !== 'suspended') {
      throw new BadRequestException('Gian hàng này hiện không bị đình chỉ.');
    }

    shop.status = 'active';
    shop.suspendedUntil = null;
    await shop.save();
    await this.suspension.cancel(shopId);

    await this.notifications.notifyUser(shop.owner, 'seller', {
      type: 'shop_suspension_lifted',
      title: 'Gian hàng của bạn đã được gỡ đình chỉ',
      body: `Quản trị viên đã gỡ đình chỉ cho gian hàng "${shop.name}" trước thời hạn. Gian hàng đã hoạt động trở lại bình thường.`,
      link: '/settings',
    });
    this.logger.log(`Admin ${admin.id} đã gỡ đình chỉ sớm cho shop ${shopId}.`);
    await this.auditLog.log({
      adminEmail: admin.email,
      action: 'Gỡ đình chỉ gian hàng',
      targetLabel: shop.name,
    });

    return { ok: true };
  }

  /* -------------------------------- Nội bộ ---------------------------------- */

  /**
   * Tính độ tin cậy của một nhóm người báo cáo trong MỘT lượt (gộp truy vấn,
   * không lặp N+1) từ 3 tín hiệu sẵn có, không cần thêm field lưu trữ/đồng bộ:
   * tuổi tài khoản + đã xác thực, lịch sử mua hàng thật (đơn đã giao thành
   * công), và độ chính xác của các báo cáo CŨ của chính người đó (bao nhiêu
   * dẫn tới hành động thật so với bị admin bỏ qua). Tính lại mỗi lần đọc thay
   * vì lưu điểm cố định — độ tin cậy đổi theo thời gian (mua hàng thêm, có
   * thêm lịch sử báo cáo chính xác…) và không có gì để đồng bộ khi nó đổi.
   */
  private async computeTrustScores(
    reporterIds: string[],
  ): Promise<Map<string, TrustInfo>> {
    const validIds = reporterIds.filter((id) => Types.ObjectId.isValid(id));
    if (validIds.length === 0) return new Map();
    const objIds = validIds.map((id) => new Types.ObjectId(id));
    const now = Date.now();

    const [users, purchaseAgg, trackAgg] = await Promise.all([
      this.userModel
        .find({ _id: { $in: objIds } })
        .select('createdAt emailVerified phoneVerified')
        .lean(),
      this.orderModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { buyer: { $in: objIds }, status: 'delivered' } },
        { $group: { _id: '$buyer', count: { $sum: 1 } } },
      ]),
      // Lịch sử báo cáo CŨ (đã xử lý) của chính người này, trên MỌI shop —
      // không giới hạn shop hiện tại, vì đây là độ tin cậy của NGƯỜI, không
      // phải của riêng quan hệ người-đó/shop-đó.
      this.reportModel.aggregate<{
        _id: { reporter: Types.ObjectId; status: string };
        count: number;
      }>([
        {
          $match: {
            reporter: { $in: objIds },
            status: { $in: ['resolved', 'dismissed'] },
          },
        },
        {
          $group: {
            _id: { reporter: '$reporter', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const purchaseCount = new Map(
      purchaseAgg.map((p) => [String(p._id), p.count]),
    );
    const track = new Map<string, { resolved: number; dismissed: number }>();
    for (const row of trackAgg) {
      const key = String(row._id.reporter);
      const cur = track.get(key) ?? { resolved: 0, dismissed: 0 };
      if (row._id.status === 'resolved') cur.resolved += row.count;
      else cur.dismissed += row.count;
      track.set(key, cur);
    }

    const result = new Map<string, TrustInfo>();
    for (const u of users) {
      const id = String(u._id);
      const createdAt = (u as unknown as { createdAt: Date }).createdAt;
      const ageDays = (now - createdAt.getTime()) / 86_400_000;
      const verified = !!(u.emailVerified || u.phoneVerified);
      const delivered = purchaseCount.get(id) ?? 0;
      const t = track.get(id) ?? { resolved: 0, dismissed: 0 };
      const weight = this.trustWeight({ ageDays, verified, delivered, ...t });
      result.set(id, { weight, tier: this.trustTier(weight) });
    }
    return result;
  }

  private trustWeight(input: {
    ageDays: number;
    verified: boolean;
    delivered: number;
    resolved: number;
    dismissed: number;
  }): number {
    let w = TRUST_BASE;
    w += Math.min(
      TRUST_AGE_MAX_BONUS,
      (input.ageDays / TRUST_AGE_FULL_DAYS) * TRUST_AGE_MAX_BONUS,
    );
    if (input.verified) w += TRUST_VERIFIED_BONUS;
    if (input.delivered === 0) w += TRUST_NO_PURCHASE_PENALTY;
    else if (input.delivered >= TRUST_ACTIVE_ORDER_THRESHOLD)
      w += TRUST_PURCHASE_BONUS_ACTIVE;
    else w += TRUST_PURCHASE_BONUS;

    const samples = input.resolved + input.dismissed;
    if (samples >= TRUST_TRACK_RECORD_MIN_SAMPLES) {
      const accuracy = input.resolved / samples; // 0..1
      w += (accuracy - 0.5) * TRUST_TRACK_RECORD_SCALE;
    }
    return Math.min(TRUST_MAX, Math.max(TRUST_MIN, w));
  }

  private trustTier(weight: number): TrustTier {
    if (weight < 0.75) return 'low';
    if (weight > 1.3) return 'trusted';
    return 'regular';
  }

  /**
   * Hồ sơ vận hành của một shop — xem `ShopProfile` để biết vì sao chọn đúng
   * các số liệu này. Gộp 5 truy vấn độc lập bằng `Promise.all` thay vì chạy
   * tuần tự.
   */
  private async computeShopProfile(shopId: string): Promise<ShopProfile> {
    const shopObjId = new Types.ObjectId(shopId);

    const [
      shop,
      orderAgg,
      reviewAgg,
      violationEvents,
      activeProducts,
      rejectedProducts,
    ] = await Promise.all([
      this.shopModel
        .findById(shopId)
        .select('businessType taxCode createdAt')
        .lean(),
      this.orderModel.aggregate<{
        _id: null;
        total: number;
        sellerCancelled: number;
        returned: number;
      }>([
        { $match: { shop: shopObjId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            sellerCancelled: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$status', 'cancelled'] },
                      { $eq: ['$cancelledBy', 'seller'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            returned: {
              $sum: { $cond: [{ $eq: ['$status', 'returned'] }, 1, 0] },
            },
          },
        },
      ]),
      this.reviewModel.aggregate<{ _id: null; avg: number; count: number }>([
        { $match: { shop: shopObjId } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]),
      // Một lượt admin xử lý gán CÙNG `resolution.resolvedAt` cho MỌI báo cáo
      // trong lượt đó (xem `resolve()`) — gộp theo mốc này để đếm đúng số
      // LẦN xử lý, không đếm trùng theo số báo cáo (5 báo cáo xử lý chung 1
      // lần chỉ là MỘT tiền án, không phải năm).
      this.reportModel.aggregate<{ _id: Date | null; action: string }>([
        {
          $match: {
            shop: shopObjId,
            status: { $in: ['resolved', 'dismissed'] },
          },
        },
        {
          $group: {
            _id: '$resolution.resolvedAt',
            action: { $first: '$resolution.action' },
          },
        },
      ]),
      this.productModel.countDocuments({
        shop: shopObjId,
        status: 'active',
        deletedAt: null,
      }),
      this.productModel.countDocuments({
        shop: shopObjId,
        'moderation.state': 'rejected',
      }),
    ]);

    const orderStats = orderAgg[0] ?? {
      total: 0,
      sellerCancelled: 0,
      returned: 0,
    };
    const reviewStats = reviewAgg[0] ?? { avg: 0, count: 0 };
    const shopCreatedAt =
      (shop as unknown as { createdAt?: Date } | null)?.createdAt ?? new Date();

    return {
      createdAt: shopCreatedAt,
      businessType: shop?.businessType ?? 'personal',
      hasTaxCode: !!shop?.taxCode,
      totalOrders: orderStats.total,
      sellerCancelRate:
        orderStats.total > 0
          ? orderStats.sellerCancelled / orderStats.total
          : 0,
      returnRate:
        orderStats.total > 0 ? orderStats.returned / orderStats.total : 0,
      ratingAvg: Math.round((reviewStats.avg ?? 0) * 10) / 10,
      ratingCount: reviewStats.count,
      pastWarnings: violationEvents.filter((e) => e.action === 'warning')
        .length,
      pastSuspensions: violationEvents.filter((e) => e.action === 'suspend')
        .length,
      activeProductCount: activeProducts,
      rejectedProductCount: rejectedProducts,
    };
  }

  private async notifyShopOfAction(
    shop: ShopDocument,
    action: 'warning' | 'suspend',
    reasons: string,
    note: string,
    suspendDays?: number,
  ) {
    const durationText = suspendDays
      ? `trong ${suspendDays} ngày (tự động hoạt động lại sau khi hết hạn)`
      : 'cho đến khi được xem xét lại';
    const title =
      action === 'suspend'
        ? 'Gian hàng của bạn đã bị tạm đình chỉ'
        : 'Gian hàng của bạn nhận được cảnh báo vi phạm';
    const body =
      action === 'suspend'
        ? `Sau khi xem xét báo cáo từ người mua (${reasons}), gian hàng "${shop.name}" đã bị tạm đình chỉ hoạt động ${durationText}. Lý do: ${note}`
        : `Sau khi xem xét báo cáo từ người mua (${reasons}), gian hàng "${shop.name}" nhận cảnh báo vi phạm. Lý do: ${note}. Vui lòng khắc phục để tránh bị đình chỉ.`;

    await this.notifications.notifyUser(shop.owner, 'seller', {
      type:
        action === 'suspend' ? 'shop_report_suspended' : 'shop_report_warning',
      title,
      body,
      link: '/settings',
    });

    try {
      const owner = await this.userModel
        .findById(shop.owner)
        .select('email')
        .lean();
      if (owner?.email) {
        await this.mail.sendShopViolationNotice(owner.email, {
          shopName: shop.name,
          action,
          reasons,
          note: suspendDays ? `${note} (Thời hạn: ${suspendDays} ngày)` : note,
        });
      }
    } catch (err) {
      // Email chỉ là kênh phụ — thông báo trong app + đổi trạng thái shop đã
      // đủ để nghiệp vụ đúng, không để lỗi gửi mail chặn luồng xử lý báo cáo.
      this.logger.warn(
        `Không gửi được email báo vi phạm cho shop ${shop.id}: ${String(err)}`,
      );
    }
  }
}
