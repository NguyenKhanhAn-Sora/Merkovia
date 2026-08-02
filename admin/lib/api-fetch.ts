/**
 * Lời gọi backend của Kênh Quản trị.
 *
 * 🔴 MỌI request phải đi qua đây, kể cả những endpoint không cần đăng nhập.
 *
 * Lý do: người mua (cổng 3000), người bán (cổng 3001) và quản trị (cổng 3002)
 * dùng chung host `localhost`, mà cookie **không tách theo cổng** — cả ba app
 * dùng chung một hũ cookie. Backend dựa vào header này để biết cấp/đọc đúng
 * bộ cookie phiên, nhờ vậy ba tài khoản khác nhau đăng nhập được cùng lúc.
 * Thiếu header là request bị coi như của người mua và đọc nhầm phiên bên kia.
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:9999";

const APP_HEADER = "x-merkovia-app";

export function appFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    // Đặt trước init.headers: nơi gọi vẫn tự do thêm Content-Type…
    headers: { [APP_HEADER]: "admin", ...(init.headers ?? {}) },
  });
}
