/** Client cho trang "Banner trang chủ" — carousel quảng cáo hiển thị đầu trang chủ buyer. */
import { apiFetch } from "./auth-api";

export interface AdminBanner {
  id: string;
  label: string;
  imageUrl: string;
  imageOriginalUrl: string;
  crop?: Record<string, unknown>;
  link?: string;
  order: number;
  isActive: boolean;
  updatedBy?: string;
  updatedAt?: string;
}

/** Bộ ảnh đầy đủ sau khi cắt: ảnh hiển thị + ảnh gốc + thông số crop để sửa lại sau. */
export interface BannerImageSet {
  imageUrl: string;
  imageKey: string;
  imageOriginalUrl: string;
  imageOriginalKey: string;
  crop?: Record<string, unknown>;
}

function errMessage(data: Record<string, unknown>, fallback: string): string {
  const m = data.message;
  if (Array.isArray(m)) return String(m[0]);
  if (typeof m === "string") return m;
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(errMessage(data, "Có lỗi xảy ra. Vui lòng thử lại."));
  return data as T;
}

export function getBanners(): Promise<AdminBanner[]> {
  return request(`/admin/banners`);
}

export function createBanner(
  input: { label: string; link?: string } & BannerImageSet,
): Promise<{ ok: boolean; id: string }> {
  return request(`/admin/banners`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateBanner(
  id: string,
  input: { label?: string; link?: string } & Partial<BannerImageSet>,
): Promise<{ ok: boolean }> {
  return request(`/admin/banners/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function reorderBanners(orderedIds: string[]): Promise<{ ok: boolean }> {
  return request(`/admin/banners/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedIds }),
  });
}

export function setBannerVisibility(id: string, isActive: boolean): Promise<{ ok: boolean }> {
  return request(`/admin/banners/${id}/visibility`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive }),
  });
}

export function deleteBanner(id: string): Promise<{ ok: boolean }> {
  return request(`/admin/banners/${id}`, { method: "DELETE" });
}

/** Tải ảnh banner lên R2, trả URL công khai + khoá object (kèm khi tạo banner). */
export async function uploadBannerImage(file: File): Promise<{ url: string; key: string }> {
  const fd = new FormData();
  fd.append("file", file, file.name);
  const res = await apiFetch(`/media/banner`, { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(errMessage(data, "Tải ảnh lên thất bại."));
  return data as { url: string; key: string };
}
