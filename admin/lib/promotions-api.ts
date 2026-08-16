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

export interface AdminPromotionDetail {
  product: {
    id: string;
    name: string;
    description?: string;
    images: string[];
    priceMin: number;
    priceMax: number;
    totalStock: number;
    status: string;
    moderationState?: string;
    stats: {
      sold: number;
      views: number;
      favorites: number;
      ratingAvg: number;
      ratingCount: number;
    };
    createdAt?: string;
  };
  shop: {
    id: string;
    name: string;
    logoUrl?: string;
    status: string;
    suspendedUntil?: string | null;
    businessType: string;
    description?: string;
    contactName: string;
    contactPhone: string;
    contactEmail?: string;
  };
  deal: {
    price: number;
    startsAt?: string;
    endsAt: string;
    discountPercent: number;
    flagged: boolean;
    flagReason?: string;
  };
  state: PromotionState;
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

export function getPromotionDetail(productId: string): Promise<AdminPromotionDetail> {
  return request(`/admin/promotions/${productId}`);
}

export function endPromotion(productId: string): Promise<{ ok: boolean }> {
  return request(`/admin/promotions/${productId}/end`, { method: "POST" });
}
