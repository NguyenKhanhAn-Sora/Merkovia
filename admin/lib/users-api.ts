/** Client cho trang "Người dùng" — quản lý tài khoản buyer/seller, khoá/gỡ khoá theo vai trò. */
import { apiFetch } from "./auth-api";

export type UserTab = "all" | "buyer" | "seller" | "locked";
export type UserRole = "buyer" | "seller" | "admin";
export type UserStatus = "active" | "pending" | "suspended" | "deleted";
/** `buyer` = chỉ cấm mua, `seller` = chỉ cấm bán (khác đình chỉ shop — vẫn cấm được đăng nhập), `all` = khoá toàn bộ tài khoản. */
export type LockScope = "buyer" | "seller" | "all";

export interface AdminUserListItem {
  id: string;
  email?: string;
  phone?: string;
  roles: UserRole[];
  status: UserStatus;
  buyerLocked: boolean;
  sellerLocked: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  name?: string;
  avatarUrl?: string;
  shop?: { name: string; slug?: string; status: string };
  createdAt?: string;
  lastLoginAt?: string;
}

export interface AdminUserListResult {
  items: AdminUserListItem[];
  total: number;
  page: number;
  limit: number;
  counts: { all: number; buyer: number; seller: number; locked: number };
}

export interface AdminUserDetail extends AdminUserListItem {
  shop?: { id: string; name: string; slug?: string; status: string };
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

export function getUsers(params: {
  tab?: UserTab;
  q?: string;
  page?: number;
  limit?: number;
}): Promise<AdminUserListResult> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  });
  return request(`/admin/users?${qs}`);
}

export function getUserDetail(id: string): Promise<AdminUserDetail> {
  return request(`/admin/users/${id}`);
}

export function lockUser(
  id: string,
  reason: string,
  scope: LockScope,
): Promise<{ ok: boolean }> {
  return request(`/admin/users/${id}/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, scope }),
  });
}

export function unlockUser(id: string, scope: LockScope): Promise<{ ok: boolean }> {
  return request(`/admin/users/${id}/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
  });
}
