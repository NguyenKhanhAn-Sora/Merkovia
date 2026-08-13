/** Client cho trang "Đánh giá" — kiểm duyệt đánh giá/phản hồi vi phạm chính sách. */
import { apiFetch } from "./auth-api";

export interface AdminReviewMedia {
  kind: "image" | "video";
  url: string;
}

export interface AdminReviewItem {
  id: string;
  rating: number;
  comment: string;
  media: AdminReviewMedia[];
  variantLabel: string;
  anonymous: boolean;
  buyer: { name: string; contact: string };
  product: { id: string; name: string; image?: string };
  shop: { id: string; name: string };
  order: { id: string; orderCode: string };
  reply?: string;
  repliedAt?: string;
  hidden: boolean;
  hiddenAt?: string;
  hiddenBy?: string;
  hiddenReason?: string;
  replyHidden: boolean;
  replyHiddenAt?: string;
  replyHiddenBy?: string;
  replyHiddenReason?: string;
  createdAt?: string;
}

export interface AdminReviewListResult {
  items: AdminReviewItem[];
  total: number;
  page: number;
  limit: number;
  counts: { all: number; hidden: number };
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

export function getReviews(params: {
  hidden?: "all" | "hidden" | "visible";
  rating?: number;
  hasMedia?: "true" | "false";
  q?: string;
  page?: number;
}): Promise<AdminReviewListResult> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  });
  return request(`/admin/reviews?${qs}`);
}

export function hideReview(id: string, reason: string): Promise<{ review: AdminReviewItem }> {
  return request(`/admin/reviews/${id}/hide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export function unhideReview(id: string): Promise<{ review: AdminReviewItem }> {
  return request(`/admin/reviews/${id}/unhide`, { method: "POST" });
}

export function hideReviewReply(id: string, reason: string): Promise<{ review: AdminReviewItem }> {
  return request(`/admin/reviews/${id}/hide-reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export function unhideReviewReply(id: string): Promise<{ review: AdminReviewItem }> {
  return request(`/admin/reviews/${id}/unhide-reply`, { method: "POST" });
}
