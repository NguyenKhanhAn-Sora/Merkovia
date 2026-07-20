import { config as loadEnv } from 'dotenv';

loadEnv();

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Thiếu biến môi trường bắt buộc: ${key}. Hãy kiểm tra lại file .env`,
    );
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function optionalNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;

  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`Biến môi trường ${key} phải là số, nhận được: "${raw}"`);
  }
  return value;
}

function optionalBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

/** Đọc thời lượng dạng "3d"/"12h"/"30m"/"45s" hoặc số giây → giây. */
function durationSeconds(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const m = /^(\d+)([smhd])$/.exec(raw);
  if (m) {
    const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2]] ?? 1;
    return Number(m[1]) * mult;
  }
  const n = Number(raw);
  return Number.isNaN(n) ? fallback : n;
}

const smtpUser = required('SMTP_USER');

export const config = {
  port: optionalNumber('PORT', 9999),
  mongoUri: required('MONGO_URI'),

  // SMTP (Gmail) — dùng để gửi email OTP
  smtp: {
    host: optional('SMTP_HOST', 'smtp.gmail.com'),
    port: optionalNumber('SMTP_PORT', 465),
    secure: optionalBool('SMTP_SECURE', true),
    user: smtpUser,
    pass: required('SMTP_PASS'),
    from: optional('MAIL_FROM', `Merkovia <${smtpUser}>`),
  },

  // Kênh gửi SMS: 'mock' (log ra console, dev) | 'twilio' | 'zns' (thêm sau).
  sms: {
    provider: optional('SMS_PROVIDER', 'mock'),
  },

  // Đăng nhập Google (OAuth). Optional để app vẫn boot khi chưa cấu hình;
  // endpoint /auth/google sẽ báo 503 nếu thiếu.
  google: {
    clientId: optional('GOOGLE_CLIENT_ID', ''),
    clientSecret: optional('GOOGLE_CLIENT_SECRET', ''),
  },

  // Chính sách OTP
  otp: {
    ttlSeconds: optionalNumber('OTP_TTL_SECONDS', 300), // hiệu lực 5 phút
    resendSeconds: optionalNumber('OTP_RESEND_SECONDS', 60), // chờ 1 phút mới gửi lại
    maxAttempts: optionalNumber('OTP_MAX_ATTEMPTS', 5),
    length: 6,
  },

  // JWT
  jwt: {
    secret: required('JWT_SECRET'),
    accessExpires: optionalNumber('JWT_EXPIRES_IN', 10800), // giây (3h)
    refreshExpires: durationSeconds('JWT_REFRESH_IN7d', 7 * 86400), // giây
  },

  // CORS: danh sách origin cụ thể (không dùng '*') để cookie credentials hoạt động.
  // Nhiều origin cách nhau bằng dấu phẩy (buyer 3000, seller 3001…).
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:3000,http://localhost:3001')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Cookie: httpOnly luôn bật; secure=true chỉ khi chạy HTTPS (production).
  cookie: {
    secure: optionalBool('COOKIE_SECURE', false),
    sameSite: optional('COOKIE_SAMESITE', 'lax') as 'lax' | 'strict' | 'none',
  },

  // Lưu trữ media — Cloudflare R2 (S3-compatible). Optional để app vẫn boot
  // khi chưa cấu hình; endpoint upload sẽ báo lỗi rõ ràng nếu thiếu.
  r2: {
    accountId: optional('R2_ACCOUNT_ID', ''),
    accessKeyId: optional('R2_ACCESS_KEY_ID', ''),
    secretAccessKey: optional('R2_SECRET_ACCESS_KEY', ''),
    bucket: optional('R2_BUCKET', ''),
    endpoint: optional('R2_ENDPOINT', ''),
    publicBaseUrl: optional('R2_PUBLIC_BASE_URL', ''),
  },
} as const;

export type Config = typeof config;
