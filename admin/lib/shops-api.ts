/** Client cho trang "Gian hàng" — quản lý chung MỌI shop, đình chỉ/gỡ trực tiếp (khác luồng report). */
import { apiFetch } from "./auth-api";

export type ShopTab = "all" | "active" | "suspended" | "pending";
export type ShopStatusValue = "active" | "pending" | "suspended";

export interface AdminShopListItem {
  id: string;
  name: string;
  slug?: string;
  status: ShopStatusValue;
  businessType: string;
  suspendedUntil?: string | null;
  createdAt?: string;
}

export interface AdminShopListResult {
  items: AdminShopListItem[];
  total: number;
  page: number;
  limit: number;
  counts: { all: number; active: number; suspended: number; pending: number };
}

export interface AdminShopDetail {
  id: string;
  name: string;
  slug?: string;
  status: ShopStatusValue;
  businessType: string;
  taxCode?: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  vacationMode: boolean;
  suspendedUntil?: string | null;
  createdAt?: string;
  owner?: { email?: string; phone?: string };
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

export function getShops(params: {
  tab?: ShopTab;
  q?: string;
  page?: number;
  limit?: number;
}): Promise<AdminShopListResult> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  });
  return request(`/admin/shops?${qs}`);
}

export function getShopDetail(id: string): Promise<AdminShopDetail> {
  return request(`/admin/shops/${id}`);
}

export function suspendShop(
  id: string,
  reason: string,
  suspendDays?: number,
): Promise<{ ok: boolean }> {
  return request(`/admin/shops/${id}/suspend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, suspendDays }),
  });
}

export function unsuspendShop(id: string): Promise<{ ok: boolean }> {
  return request(`/admin/shops/${id}/unsuspend`, { method: "POST" });
}
