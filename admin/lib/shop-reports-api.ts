/** Client cho trang "Báo cáo" — hàng đợi ưu tiên xử lý báo cáo vi phạm gian hàng. */
import { apiFetch } from "./auth-api";

export type ReportTier = "urgent" | "high" | "medium" | "low";
export type ReportAction = "warning" | "suspend" | "dismiss";

export const REPORT_REASON_LABEL: Record<string, string> = {
  counterfeit: "Bán hàng giả / hàng nhái",
  prohibited_item: "Hàng cấm / vi phạm pháp luật",
  scam: "Lừa đảo (nhận tiền không giao hàng, đánh tráo hàng...)",
  fake_listing: "Mô tả / hình ảnh sai sự thật",
  poor_service: "Thái độ phục vụ kém, quấy rối",
  spam: "Spam quảng cáo, nhắn tin làm phiền",
  other: "Lý do khác",
};

export const REPORT_TIER_LABEL: Record<ReportTier, string> = {
  urgent: "Khẩn cấp",
  high: "Cao",
  medium: "Trung bình",
  low: "Thấp",
};

export type ReporterTrustTier = "low" | "regular" | "trusted";

export const REPORTER_TRUST_LABEL: Record<ReporterTrustTier, string> = {
  low: "Tài khoản cần thận trọng",
  regular: "Người dùng thường",
  trusted: "Người mua uy tín",
};

export interface ReportQueueItem {
  shopId: string;
  shopName: string;
  shopSlug?: string;
  shopStatus: "pending" | "active" | "suspended";
  /** Số người báo cáo KHÁC NHAU đang chờ xử lý — mỗi người chỉ tính 1 lần. */
  reportCount: number;
  reasons: string[];
  /** Điểm ưu tiên = Σ (mức nghiêm trọng × độ tin cậy người báo) — quyết định `tier`. */
  score: number;
  tier: ReportTier;
  oldestReportAt: string;
  latestReportAt: string;
}

export interface ShopReportItem {
  id: string;
  reasonType: string;
  reasonLabel: string;
  detail?: string;
  status: "pending" | "resolved" | "dismissed";
  reporterContact: string;
  /** Độ tin cậy của người gửi — chỉ để admin tham khảo, không tự loại báo cáo nào. */
  reporterTrust: ReporterTrustTier;
  orderId?: string;
  createdAt: string;
  resolution?: {
    action: ReportAction;
    note?: string;
    resolvedAt: string;
    resolvedBy: string;
  };
}

export interface ShopReportsDetail {
  shop: {
    id: string;
    name: string;
    slug?: string;
    status: string;
    /** Hạn tự động gỡ đình chỉ (nếu đình chỉ có thời hạn) — `null`/không có = vô thời hạn. */
    suspendedUntil?: string | null;
  };
  reports: ShopReportItem[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const raw = data.message;
    const message = Array.isArray(raw) ? String(raw[0]) : String(raw ?? "");
    throw new Error(message || "Có lỗi xảy ra. Vui lòng thử lại.");
  }
  return data as T;
}

export function getReportQueue(): Promise<ReportQueueItem[]> {
  return request("/admin/shop-reports");
}

export function getShopReports(shopId: string): Promise<ShopReportsDetail> {
  return request(`/admin/shop-reports/shop/${shopId}`);
}

export function resolveShopReports(
  shopId: string,
  payload: { action: ReportAction; note?: string; suspendDays?: number },
): Promise<{ ok: boolean; resolvedCount: number }> {
  return request(`/admin/shop-reports/shop/${shopId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** Gỡ đình chỉ sớm — trước hạn, hoặc khi đình chỉ vô thời hạn (cách duy nhất để gỡ). */
export function unsuspendShop(shopId: string): Promise<{ ok: boolean }> {
  return request(`/admin/shop-reports/shop/${shopId}/unsuspend`, {
    method: "POST",
  });
}
