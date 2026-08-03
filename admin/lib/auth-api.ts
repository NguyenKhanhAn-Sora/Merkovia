/**
 * Client gọi sang backend NestJS cho luồng đăng nhập admin.
 */
import { appFetch } from "./api-fetch";
import { clearAdmin, type AdminUser } from "./session";

/* ------------------------------------------------------------------ *
 *  Quản lý phiên: gia hạn ngầm khi access token hết hạn.
 *
 *  Access token admin sống rất ngắn (mặc định 15 phút) nên sẽ hết hạn giữa
 *  chừng là chuyện bình thường khi đang thao tác. Gọi /admin-auth/refresh
 *  bằng refresh token rồi thử lại request — admin không nhận ra gì cả. Chỉ
 *  khi refresh token cũng hết hạn/bị thu hồi (đăng xuất, khởi động lại
 *  server) mới bắt đăng nhập lại.
 * ------------------------------------------------------------------ */

/** Gộp nhiều request cùng lỗi 401 vào CHUNG một lần refresh. */
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= appFetch(`/admin-auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/** Phiên hết hẳn → dọn cache và đưa về trang đăng nhập kèm lý do. */
function handleSessionExpired() {
  if (typeof window === "undefined") return;
  clearAdmin();
  if (!window.location.pathname.startsWith("/login")) {
    window.location.replace("/login?expired=1");
  }
}

/**
 * fetch cho các endpoint CẦN đăng nhập.
 * Gặp 401 → gia hạn ngầm → thử lại đúng một lần.
 * Không dùng cho login: 401 ở đó là lỗi thật (sai mật khẩu…).
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const options: RequestInit = { credentials: "include", ...init };
  const res = await appFetch(`${path}`, options);
  if (res.status !== 401) return res;

  if (!(await refreshSession())) {
    handleSessionExpired();
    return res;
  }
  return appFetch(`${path}`, options);
}

/** Lấy message lỗi từ response backend (class-validator trả mảng). */
function errMessage(data: Record<string, unknown>, fallback: string): string {
  const m = data.message;
  if (Array.isArray(m)) return String(m[0]);
  if (typeof m === "string") return m;
  return fallback;
}

/**
 * Đăng nhập bằng email + mật khẩu.
 * Token được backend đặt trong cookie httpOnly — chỉ trả về thông tin admin
 * (không nhạy cảm) để hiển thị UI.
 */
export async function loginAdmin(
  email: string,
  password: string,
): Promise<{ admin: AdminUser }> {
  const res = await appFetch(`/admin-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(errMessage(data, "Đăng nhập thất bại."));
  return data as unknown as { admin: AdminUser };
}

/**
 * Gọi backend thu hồi phiên (xoá cookie httpOnly + vô hiệu hoá mọi access/
 * refresh token đã phát, không chỉ token hiện tại — xem `AdminAuthService`).
 * Trả `false` khi request thất bại (mất mạng…) — nơi gọi vẫn PHẢI dọn state
 * cục bộ và điều hướng ra khỏi dashboard, không được để admin kẹt lại màn
 * hình đã đăng nhập chỉ vì một request thất bại.
 */
export async function logout(): Promise<boolean> {
  try {
    const res = await appFetch(`/admin-auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Vừa xác minh phiên vừa lấy thông tin admin trong MỘT request (dùng khi vào
 * trang dashboard).
 * - `alive: false` → phiên đã chết, apiFetch đã tự điều hướng sang /login.
 */
export async function loadAdminSession(): Promise<{
  alive: boolean;
  admin: AdminUser | null;
}> {
  try {
    const res = await apiFetch("/admin-auth/me");
    if (!res.ok) return { alive: false, admin: null };
    const data = (await res.json()) as { admin: AdminUser };
    return { alive: true, admin: data.admin };
  } catch {
    // Lỗi mạng — chưa chắc phiên chết, đừng đá admin ra ngoài.
    return { alive: true, admin: null };
  }
}
