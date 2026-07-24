import type { Request } from 'express';
import { config } from '../config/config';

/**
 * Hai app dùng chung một backend nhưng phải là HAI phiên đăng nhập độc lập.
 *
 * 🔴 Vì sao không thể dùng chung một tên cookie: cookie **không tách theo cổng**.
 * `localhost:3000` (người mua) và `localhost:3001` (người bán) dùng chung một hũ
 * cookie của host `localhost`, nên đăng nhập bên này ghi đè token bên kia — mở
 * lại trang người mua thì thấy mình đang là người bán. Lên production mà đặt
 * cookie theo tên miền cha (`.merkovia.com`) thì vẫn đúng lỗi đó.
 *
 * Cách chữa: mỗi app một BỘ TÊN cookie riêng. Hai bộ tên cùng nằm trong một hũ
 * mà không đụng nhau, không phụ thuộc cổng hay tên miền.
 */
export const APP_SCOPES = ['buyer', 'seller'] as const;
export type AppScope = (typeof APP_SCOPES)[number];

/** Header để app tự khai mình là ai. */
export const APP_HEADER = 'x-merkovia-app';

/** Tiền tố tên cookie. Người mua giữ tên cũ để phiên đang đăng nhập không bị văng. */
const PREFIX: Record<AppScope, string> = { buyer: '', seller: 'seller_' };

export function accessCookieName(scope: AppScope): string {
  return `${PREFIX[scope]}access_token`;
}

export function refreshCookieName(scope: AppScope): string {
  return `${PREFIX[scope]}refresh_token`;
}

/**
 * Request này thuộc app nào.
 *
 * Hai nguồn, theo thứ tự ưu tiên — cố ý dư một tầng vì đoán nhầm ở đây là trả
 * nhầm tài khoản của người khác:
 *  1. Header app tự khai. Rõ ràng, không phụ thuộc hạ tầng, và sống sót khi có
 *     proxy đứng giữa cắt mất `Origin`.
 *  2. `Origin` của trình duyệt. Tự động nên không thể quên gắn — chặn được
 *     trường hợp sau này ai đó thêm một lời gọi `fetch` mới mà thiếu header.
 *
 * Không nhận ra được thì coi là người mua: đó là app công khai, và nhầm theo
 * hướng này chỉ dẫn tới "chưa đăng nhập" chứ không lộ phiên của ai.
 */
export function scopeFromRequest(req: Request): AppScope {
  const declared = req.headers[APP_HEADER];
  const raw = Array.isArray(declared) ? declared[0] : declared;
  if (raw && (APP_SCOPES as readonly string[]).includes(raw)) {
    return raw as AppScope;
  }

  const origin = req.headers.origin;
  if (origin && config.sellerUrl && origin === config.sellerUrl) return 'seller';

  return 'buyer';
}

/**
 * Tách một cookie từ chuỗi header `Cookie` thô.
 * Dùng chung cho cả request HTTP lẫn handshake của socket.io (chỗ đó không có
 * đối tượng `Request` của Express).
 */
export function readCookieFromHeader(
  raw: string | undefined,
  name: string,
): string | undefined {
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

/**
 * Đọc một cookie httpOnly từ header thô.
 * Dự án không dùng `cookie-parser`, và guard chạy trước mọi middleware phân
 * tích nên phải tự tách. Gom về một chỗ thay vì chép ở ba nơi như trước.
 */
export function readCookie(req: Request, name: string): string | undefined {
  return readCookieFromHeader(req.headers.cookie, name);
}

/**
 * App của một handshake socket.io. Ưu tiên `auth.app` client tự khai (rõ ràng,
 * sống sót qua proxy), lùi về `Origin` — cùng quy tắc `scopeFromRequest`.
 */
export function scopeFromSocket(handshake: {
  auth?: Record<string, unknown>;
  headers: Record<string, unknown>;
}): AppScope {
  const declared = handshake.auth?.app;
  if (
    typeof declared === 'string' &&
    (APP_SCOPES as readonly string[]).includes(declared)
  ) {
    return declared as AppScope;
  }
  const origin = handshake.headers.origin;
  if (typeof origin === 'string' && config.sellerUrl && origin === config.sellerUrl) {
    return 'seller';
  }
  return 'buyer';
}

/** Access token của đúng app gửi request. */
export function readAccessToken(req: Request): string | undefined {
  return readCookie(req, accessCookieName(scopeFromRequest(req)));
}
