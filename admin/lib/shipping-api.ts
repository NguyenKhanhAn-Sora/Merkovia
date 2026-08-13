/** Client cho trang "Vận chuyển" — biểu cước toàn sàn (singleton), admin sửa trực tiếp không cần deploy. */
import { apiFetch } from "./auth-api";

export interface ZoneRate {
  base: number;
  perHalfKg: number;
  etaMinDays: number;
  etaMaxDays: number;
}

export interface ShippingSettings {
  intra_province: ZoneRate;
  inter_province: ZoneRate;
  long_haul: ZoneRate;
  freeShippingThreshold: number;
  longHaulKm: number;
  updatedBy?: string;
  updatedAt?: string;
}

/** Hằng số kỹ thuật cố định — chỉ hiển thị, KHÔNG sửa được (xem giải thích ở backend). */
export interface ShippingConstants {
  INCLUDED_GRAM: number;
  VOLUMETRIC_DIVISOR: number;
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

export function getShippingSettings(): Promise<{
  settings: ShippingSettings;
  constants: ShippingConstants;
}> {
  return request("/admin/shipping");
}

export function updateShippingSettings(
  payload: ShippingSettings,
): Promise<{ settings: ShippingSettings }> {
  const { updatedBy: _updatedBy, updatedAt: _updatedAt, ...body } = payload;
  return request("/admin/shipping", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
