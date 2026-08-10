/** Client cho trang "Đơn hàng" — tra cứu đơn hàng TOÀN SÀN (chỉ đọc, can thiệp tranh chấp đi qua trang Báo cáo). */
import { apiFetch } from "./auth-api";

export type OrderStatus =
  | "pending_payment"
  | "pending"
  | "confirmed"
  | "shipping"
  | "delivered"
  | "cancelled"
  | "returned";

export interface AdminOrderListItem {
  id: string;
  orderCode: string;
  status: OrderStatus;
  statusLabel: string;
  shop: { id: string; name: string; slug?: string };
  buyer: { id: string; contact: string };
  itemsTotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  paymentMethod: "cod" | "online";
  paidAt?: string;
  createdAt?: string;
}

export interface AdminOrderListResult {
  items: AdminOrderListItem[];
  total: number;
  page: number;
  limit: number;
  counts: Record<string, number>;
}

export interface AdminOrderLineItem {
  productId: string;
  name: string;
  image?: string;
  variantLabel: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface AdminOrderEvent {
  status: OrderStatus;
  at: string;
  by?: string;
  note?: string;
}

export interface AdminOrderDetail extends AdminOrderListItem {
  items: AdminOrderLineItem[];
  cancelledBy?: "buyer" | "seller" | "system";
  cancelReasonType?: string;
  cancelReason?: string;
  cancelRequest?: {
    status: "pending" | "approved" | "rejected";
    reason?: string;
    requestedAt: string;
  };
  returnRequest?: {
    status: "requested" | "approved" | "rejected";
    reason?: string;
    requestedAt: string;
  };
  shippingAddress?: {
    recipientName: string;
    recipientPhone: string;
    street: string;
    ward?: string;
    district?: string;
    province: string;
  };
  timeline?: AdminOrderEvent[];
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

export function getOrders(params: {
  status?: OrderStatus | "all";
  q?: string;
  page?: number;
  limit?: number;
}): Promise<AdminOrderListResult> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== "all") qs.set(k, String(v));
  });
  return request(`/admin/orders?${qs}`);
}

export function getOrderDetail(id: string): Promise<{ order: AdminOrderDetail }> {
  return request(`/admin/orders/${id}`);
}
