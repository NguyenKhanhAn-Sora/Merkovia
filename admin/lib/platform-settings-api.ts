/** Client cho trang "Cài đặt" — cấu hình chính sách toàn sàn (singleton), admin sửa trực tiếp không cần deploy. */
import { apiFetch } from "./auth-api";

export interface PlatformSettings {
  commissionRate: number;
  payoutHoldDays: number;
  returnWindowDays: number;
  reviewEditWindowHours: number;
  orderConfirmHours: number;
  orderConfirmWarnHours: number;
  orderShipHours: number;
  orderShipWarnHours: number;
  reportUrgentScore: number;
  reportHighScore: number;
  reportMediumScore: number;
  updatedBy?: string;
  updatedAt?: string;
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

export function getPlatformSettings(): Promise<PlatformSettings> {
  return request("/admin/platform-settings");
}

export function updatePlatformSettings(
  payload: PlatformSettings,
): Promise<PlatformSettings> {
  const { updatedBy: _updatedBy, updatedAt: _updatedAt, ...body } = payload;
  return request("/admin/platform-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
