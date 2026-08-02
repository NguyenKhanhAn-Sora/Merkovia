export interface AdminUser {
  id: string;
  email: string;
}

/**
 * Chỉ lưu thông tin admin KHÔNG nhạy cảm (để hiển thị UI).
 * Access/refresh token nằm trong cookie httpOnly do backend đặt — JS không
 * đọc được (chống XSS đánh cắp token).
 *
 * Luôn dùng sessionStorage (mất khi đóng trình duyệt), không có tuỳ chọn
 * "ghi nhớ đăng nhập" như buyer/seller — phiên admin cố tình ngắn để giảm
 * rủi ro khi tài khoản có toàn quyền hệ thống.
 */
const ADMIN = "merkovia_admin";

export function saveAdmin(admin: AdminUser) {
  sessionStorage.setItem(ADMIN, JSON.stringify(admin));
}

export function clearAdmin() {
  sessionStorage.removeItem(ADMIN);
}

export function getAdmin(): AdminUser | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(ADMIN);
  return raw ? (JSON.parse(raw) as AdminUser) : null;
}
