/** Client cho trang "Đối soát & Rút tiền" — xem toàn bộ đợt chi trả của sàn, gỡ kẹt đợt đang `processing`. */
import { apiFetch } from "./auth-api";

export type PayoutStatus = "pending" | "processing" | "paid" | "failed";

export interface AdminPayoutListItem {
  id: string;
  code: string;
  shop: { id: string; name: string };
  orderCount: number;
  grossAmount: number;
  commissionAmount: number;
  commissionRate: number;
  netAmount: number;
  status: PayoutStatus;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  provider: string;
  providerRef?: string;
  paidAt?: string;
  failureReason?: string;
  adminResolutionNote?: string;
  resolvedByAdminEmail?: string;
  createdAt?: string;
}

export interface AdminPayoutListResult {
  items: AdminPayoutListItem[];
  total: number;
  page: number;
  limit: number;
  counts: Record<string, number>;
}

export interface AdminPayoutOrderItem {
  id: string;
  orderCode: string;
  total: number;
  deliveredAt?: string;
}

export interface AdminPayoutDetail {
  payout: AdminPayoutListItem;
  orders: AdminPayoutOrderItem[];
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

export function getPayouts(params: {
  status?: PayoutStatus | "all";
  q?: string;
  page?: number;
  limit?: number;
}): Promise<AdminPayoutListResult> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== "all") qs.set(k, String(v));
  });
  return request(`/admin/payouts?${qs}`);
}

export function getPayoutDetail(id: string): Promise<AdminPayoutDetail> {
  return request(`/admin/payouts/${id}`);
}

export function checkPayoutStatus(
  id: string,
): Promise<{ changed: boolean; payout: AdminPayoutListItem }> {
  return request(`/admin/payouts/${id}/check-status`, { method: "POST" });
}

export function resolvePayout(
  id: string,
  action: "paid" | "failed",
  note: string,
): Promise<{ payout: AdminPayoutListItem }> {
  return request(`/admin/payouts/${id}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, note }),
  });
}
