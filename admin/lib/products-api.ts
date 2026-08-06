/** Client cho trang "Sản phẩm" — hàng đợi kiểm duyệt AI + duyệt tay của admin. */
import { apiFetch } from "./auth-api";

export type ModerationTab = "pending" | "rejected" | "ok" | "all";
export type ModerationState = "ok" | "pending" | "rejected";
export type ModerationDecider = "ai" | "admin";

export interface Moderation {
  state: ModerationState;
  reason?: string;
  reviewedAt?: string;
  reviewedBy?: ModerationDecider;
}

export interface AdminProductListItem {
  id: string;
  name: string;
  image?: string;
  shop: { name: string; slug: string };
  category?: string;
  priceMin: number;
  status: "draft" | "active" | "hidden";
  moderation: Moderation;
  updatedAt?: string;
}

export interface AdminProductListResult {
  items: AdminProductListItem[];
  total: number;
  page: number;
  limit: number;
  counts: { pending: number; rejected: number; ok: number; all: number };
}

export interface ModerationLogItem {
  id: string;
  verdict: "approve" | "reject" | "error";
  reason?: string;
  decidedBy: ModerationDecider;
  aiModel?: string;
  adminEmail?: string;
  createdAt: string;
}

export interface AdminProductDetail {
  _id: string;
  name: string;
  description?: string;
  images: { url: string; key?: string }[];
  video?: { url: string };
  attributes: { name: string; value: string }[];
  variants: { optionValues: string[]; price: number; stock: number; image?: string }[];
  optionTiers: { name: string; values: string[] }[];
  category?: { name: string };
  shop: { name: string; slug: string; status: string };
  status: "draft" | "active" | "hidden";
  moderation: Moderation;
  createdAt?: string;
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

export function getProducts(params: {
  tab?: ModerationTab;
  q?: string;
  page?: number;
  limit?: number;
}): Promise<AdminProductListResult> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  });
  return request(`/admin/products?${qs}`);
}

export function getProductDetail(
  id: string,
): Promise<{ product: AdminProductDetail; logs: ModerationLogItem[] }> {
  return request(`/admin/products/${id}`);
}

export function moderateProduct(
  id: string,
  action: "approve" | "reject",
  reason?: string,
): Promise<{ ok: boolean }> {
  return request(`/admin/products/${id}/moderate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, reason }),
  });
}
