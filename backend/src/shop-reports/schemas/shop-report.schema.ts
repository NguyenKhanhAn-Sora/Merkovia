import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ShopReportDocument = HydratedDocument<ShopReport>;

/**
 * Lý do báo cáo gian hàng — tập đóng để admin lọc/thống kê, tránh gõ tự do
 * lộn xộn (giống `RETURN_REASONS`). Có nhãn tiếng Việt kèm để dựng nội dung
 * thông báo/email phía server (khác `RETURN_REASONS`: nhãn đó chỉ nằm ở
 * frontend vì không cần sinh văn bản tự động).
 */
export const REPORT_REASONS = [
  'counterfeit', // hàng giả / hàng nhái
  'prohibited_item', // hàng cấm / vi phạm pháp luật
  'scam', // lừa đảo: nhận tiền không giao hàng, đánh tráo hàng...
  'fake_listing', // mô tả/ảnh sai sự thật so với hàng nhận được
  'poor_service', // thái độ phục vụ kém, quấy rối người mua
  'spam', // spam quảng cáo, nhắn tin làm phiền
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABEL_VI: Record<ReportReason, string> = {
  counterfeit: 'Bán hàng giả / hàng nhái',
  prohibited_item: 'Hàng cấm / vi phạm pháp luật',
  scam: 'Lừa đảo (nhận tiền không giao hàng, đánh tráo hàng...)',
  fake_listing: 'Mô tả/hình ảnh sai sự thật',
  poor_service: 'Thái độ phục vụ kém, quấy rối người mua',
  spam: 'Spam quảng cáo, nhắn tin làm phiền',
  other: 'Lý do khác',
};

/**
 * Mức độ nghiêm trọng CỐ ĐỊNH theo lý do — nguồn vào của điểm ưu tiên xử lý.
 * `other` xếp `medium` vì chưa rõ bản chất, cần admin đọc mới phân loại được.
 */
export type ReportSeverity = 'high' | 'medium' | 'low';
export const REPORT_SEVERITY: Record<ReportReason, ReportSeverity> = {
  counterfeit: 'high',
  prohibited_item: 'high',
  scam: 'high',
  fake_listing: 'medium',
  other: 'medium',
  poor_service: 'low',
  spam: 'low',
};

/** Trạng thái xử lý MỘT báo cáo. Nhiều báo cáo cùng shop được xử lý gộp một lần. */
export const REPORT_STATUS = ['pending', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUS)[number];

/** Hành động admin áp dụng khi xử lý — quyết định có đổi trạng thái shop hay không. */
export const REPORT_ACTIONS = ['warning', 'suspend', 'dismiss'] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

export const EVIDENCE_KINDS = ['image', 'video'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Tối đa mỗi báo cáo — đủ minh chứng, không thành kho ảnh. Khớp `MAX_MEDIA` của đánh giá. */
export const MAX_EVIDENCE = 6;

/**
 * Ảnh/video người báo cáo đính kèm làm bằng chứng — cho admin CƠ SỞ để xác
 * nhận vi phạm thay vì chỉ có một dòng lý do dạng chữ. Giữ đúng cấu trúc
 * `ReviewMedia` (đánh giá sản phẩm) để dùng chung một luồng tải lên/hiển thị.
 */
@Schema({ _id: false })
export class ReportEvidence {
  @Prop({ type: String, enum: EVIDENCE_KINDS, required: true })
  kind: EvidenceKind;

  @Prop({ required: true, trim: true })
  url: string;

  /** Khoá trên R2 — giữ lại để dọn được file nếu sau này cần xoá báo cáo. */
  @Prop({ trim: true })
  key?: string;
}
const ReportEvidenceSchema = SchemaFactory.createForClass(ReportEvidence);

/** Kết quả xử lý — chỉ có khi báo cáo đã `resolved`/`dismissed`. */
@Schema({ _id: false })
export class ShopReportResolution {
  @Prop({ type: String, enum: REPORT_ACTIONS, required: true })
  action: ReportAction;

  /** Ghi chú của admin — bắt buộc với `warning`/`suspend` để shop biết vì sao (xem DTO). */
  @Prop({ trim: true, maxlength: 500 })
  note?: string;

  @Prop({ required: true })
  resolvedAt: Date;

  /** Luôn `'root-admin'` ở phiên bản admin đơn tài khoản hiện tại. */
  @Prop({ trim: true, required: true })
  resolvedBy: string;
}
const ShopReportResolutionSchema =
  SchemaFactory.createForClass(ShopReportResolution);

/**
 * Báo cáo vi phạm của một gian hàng, do người mua gửi.
 *
 * Nhiều báo cáo có thể trỏ tới cùng một shop — đây là tín hiệu QUAN TRỌNG cho
 * độ ưu tiên xử lý (xem `ShopReportsService.priorityQueue`), nên KHÔNG gộp
 * chúng thành một bản ghi mà giữ riêng từng cái, chỉ gộp khi admin xử lý
 * (`resolve` cập nhật hàng loạt các báo cáo `pending` của cùng shop).
 */
@Schema({ timestamps: true })
export class ShopReport {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  reporter: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Shop',
    required: true,
    index: true,
  })
  shop: Types.ObjectId;

  @Prop({ type: String, enum: REPORT_REASONS, required: true })
  reasonType: ReportReason;

  /** Mô tả của người báo cáo — bắt buộc khi lý do là "other", còn lại tuỳ chọn. */
  @Prop({ trim: true, maxlength: 500 })
  detail?: string;

  /**
   * Đơn hàng liên quan (nếu báo cáo từ trang chi tiết đơn) — chỉ để admin có
   * thêm ngữ cảnh, KHÔNG dùng để phân quyền hay tính điểm ưu tiên.
   */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Order' })
  order?: Types.ObjectId;

  /** Bằng chứng đính kèm (ảnh/video) — tuỳ chọn, giúp admin xác nhận vi phạm nhanh hơn. */
  @Prop({ type: [ReportEvidenceSchema], default: [] })
  evidence: ReportEvidence[];

  @Prop({
    type: String,
    enum: REPORT_STATUS,
    default: 'pending',
    required: true,
    index: true,
  })
  status: ReportStatus;

  @Prop({ type: ShopReportResolutionSchema })
  resolution?: ShopReportResolution;
}

export const ShopReportSchema = SchemaFactory.createForClass(ShopReport);

// Hàng đợi ưu tiên: gom báo cáo đang chờ theo shop.
ShopReportSchema.index({ shop: 1, status: 1, createdAt: -1 });
// Chặn spam: một người chỉ được có MỘT báo cáo đang chờ cho MỘT shop tại một
// thời điểm. `ShopReportsService.create` đã kiểm tra trước khi tạo, nhưng đó
// chỉ là kiểm tra rồi mới ghi (TOCTOU) — 2 request gửi cùng lúc vẫn có thể lọt
// cả hai. Index UNIQUE có điều kiện này mới là chốt chặn thật ở tầng DB, giống
// cách `Review` chặn trùng {order, variant}.
ShopReportSchema.index(
  { reporter: 1, shop: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);
// `priorityQueue()` quét TOÀN sàn (không lọc theo shop) theo status + createdAt.
ShopReportSchema.index({ status: 1, createdAt: 1 });
// `resolvedHistory()` quét TOÀN sàn theo status + thời điểm xử lý.
ShopReportSchema.index({ status: 1, 'resolution.resolvedAt': -1 });
