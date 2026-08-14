/** Client cho trang "Khuyến mãi" — khuyến mãi toàn sàn + phát hiện giá ảo. */
import { apiFetch } from "./auth-api";

export type PromotionTab = "all" | "live" | "scheduled" | "flagged";
export type PromotionState = "live" | "scheduled" | "ended";

export interface AdminPromotionItem {
  productId: string;
  name: string;
  slug?: string;
  image?: string;
  shop: { id: string; name: string };
  priceMin: number;
  priceMax: number;
  totalStock: number;
  status: string;
  state: PromotionState;
  flagged: boolean;
  flagReason?: string;
  deal?: {
    price: number;
    startsAt?: string;
    endsAt: string;
    discountPercent: number;
  };
}

export interface AdminPromotionListResult {
  items: AdminPromotionItem[];
  counts: { all: number; live: number; scheduled: number; flagged: number };
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

export function getPromotions(tab: PromotionTab): Promise<AdminPromotionListResult> {
  return request(`/admin/promotions?tab=${tab}`);
}

export function endPromotion(productId: string): Promise<{ ok: boolean }> {
  return request(`/admin/promotions/${productId}/end`, { method: "POST" });
}
