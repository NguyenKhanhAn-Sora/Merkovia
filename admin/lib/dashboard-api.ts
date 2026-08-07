/** Client cho trang "Tổng quan" — số liệu tổng hợp toàn sàn. */
import { apiFetch } from "./auth-api";

export type AdminOrderStatus =
  | "pending_payment"
  | "pending"
  | "confirmed"
  | "shipping"
  | "delivered"
  | "cancelled"
  | "returned";

export interface DashboardOverview {
  totalUsers: number;
  shops: { active: number; suspended: number };
  ordersToday: number;
  revenueToday: number;
  recentOrders: {
    id: string;
    orderCode: string;
    buyer: string;
    shopName: string;
    total: number;
    status: AdminOrderStatus;
  }[];
  pendingReportShops: { shopId: string; shopName: string; latestAt: string }[];
  pendingProducts: number;
  failedPayouts: { count: number; total: number };
  /** % đơn giao thành công trong 30 ngày (trên tổng đơn đã kết thúc) — `null` nếu chưa có đơn nào kết thúc. */
  successRate: number | null;
  recentActivity: { id: string; action: string; targetLabel?: string; createdAt: string }[];
}

export async function getDashboardOverview(): Promise<DashboardOverview | null> {
  try {
    const res = await apiFetch("/admin/dashboard");
    if (!res.ok) return null;
    return (await res.json()) as DashboardOverview;
  } catch {
    return null;
  }
}
