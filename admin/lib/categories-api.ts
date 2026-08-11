/** Client cho trang "Danh mục" — quản lý cây Ngành hàng (gốc) → Danh mục (lá), 2 cấp cố định. */
import { apiFetch } from "./auth-api";

export interface AdminCategoryNode {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  order: number;
  isActive: boolean;
  productCount: number;
  children: AdminCategoryNode[];
  hasNoActiveChildren?: boolean;
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

export function getCategoryTree(): Promise<AdminCategoryNode[]> {
  return request(`/admin/categories`);
}

export function createCategory(input: {
  name: string;
  parentId?: string;
  icon?: string;
}): Promise<{ ok: boolean; id: string }> {
  return request(`/admin/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateCategory(
  id: string,
  input: { name?: string; icon?: string },
): Promise<{ ok: boolean }> {
  return request(`/admin/categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Ghi thứ tự mới cho cả nhóm anh em sau khi kéo-thả — `parentId` bỏ trống = nhóm Ngành hàng gốc. */
export function reorderCategories(
  parentId: string | undefined,
  orderedIds: string[],
): Promise<{ ok: boolean }> {
  return request(`/admin/categories/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parentId, orderedIds }),
  });
}

export function setCategoryVisibility(
  id: string,
  isActive: boolean,
): Promise<{ ok: boolean }> {
  return request(`/admin/categories/${id}/visibility`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive }),
  });
}

export function deleteCategory(id: string): Promise<{ ok: boolean }> {
  return request(`/admin/categories/${id}`, { method: "DELETE" });
}
