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

  /**
   * Goong Maps — gợi ý địa chỉ chi tiết và lấy toạ độ.
   *
   * Chọn Goong vì **Google Maps không nhận thanh toán từ tài khoản Việt Nam**,
   * còn API của Goong tương thích với Google nên đổi sang sau này chỉ là đổi
   * endpoint. Để trống thì tính năng gợi ý TỰ TẮT — ô địa chỉ vẫn nhập tay
   * được. Tuyệt đối không sinh gợi ý giả: người dùng sẽ tưởng địa chỉ đã được
   * kiểm chứng trong khi không có gì được kiểm cả.
   */
  goong: {
    /** Khoá REST — CHỈ dùng ở server (gợi ý địa chỉ, tra toạ độ). */
    apiKey: optional('GOONG_API_KEY', ''),
    baseUrl: optional('GOONG_BASE_URL', 'https://rsapi.goong.io'),

    /**
     * Khoá maptiles — trình duyệt gọi thẳng để tải ảnh bản đồ nên BẮT BUỘC lộ
     * ra client, đây là thiết kế của nhà cung cấp (giống public token của
     * Mapbox). Vì thế phải là khoá RIÊNG, không dùng chung với `apiKey`, và
     * nên giới hạn theo tên miền trong bảng điều khiển Goong.
     */
    mapTilesKey: optional('GOONG_MAPTILES_KEY', ''),

    /** Để trong config phòng khi nhà cung cấp đổi đường dẫn style. */
    mapStyleUrl: optional(
      'GOONG_MAP_STYLE_URL',
      'https://tiles.goong.io/assets/goong_map_web.json',
    ),
  },

  /**
   * Gemini — sinh vector embedding cho TÌM KIẾM NGỮ NGHĨA.
   *
   * Chọn Gemini vì `text-embedding-004` có gói miễn phí rộng và tiếng Việt tốt.
   * ĐỂ TRỐNG `apiKey` thì tính năng TỰ TẮT: sản phẩm không được sinh vector và
   * tìm kiếm tự lui về khớp từ khoá (regex trên `searchText`) như cũ — không lỗi.
   * Tuyệt đối không bịa vector: thiếu khoá thì thà tìm theo từ khoá còn hơn xếp
   * hạng theo dữ liệu giả.
   */
  gemini: {
    apiKey: optional('GEMINI_API_KEY', ''),
    /**
     * `gemini-embedding-001` là model embedding GA hiện tại (Google đã ngừng
     * `text-embedding-004`). Đổi model chỉ cần đổi env; nhớ backfill lại vì số
     * chiều có thể khác — vector khác chiều sẽ bị bỏ qua khi tính cosine.
     */
    embedModel: optional('GEMINI_EMBED_MODEL', 'gemini-embedding-001'),
    baseUrl: optional(
      'GEMINI_BASE_URL',
      'https://generativelanguage.googleapis.com/v1beta',
    ),
  },

  // URL app người mua — cổng thanh toán dùng để đưa khách quay về sau khi trả.
  frontendUrl: optional('FRONTEND_URL', 'http://localhost:3000'),

  /**
   * URL app Kênh Người Bán. Dùng để nhận ra request đến từ app nào mà cấp đúng
   * bộ cookie — hai app dùng chung host thì dùng chung hũ cookie, không tách
   * theo cổng được. Xem `common/auth-scope.ts`.
   */
  sellerUrl: optional('SELLER_URL', 'http://localhost:3001'),

  /**
   * Bí mật ký/xác thực webhook thanh toán.
   * Với cổng thật đây là secret do nhà cung cấp cấp. Có giá trị mặc định để
   * môi trường dev vẫn boot được, nhưng KHÔNG được dùng mặc định khi chạy thật.
   */
  paymentWebhookSecret: optional(
    'PAYMENT_WEBHOOK_SECRET',
    'merkovia-dev-webhook-secret',
  ),

  /** Hoa hồng sàn giữ lại trên tiền hàng (0.05 = 5%). */
  commissionRate: optionalNumber('COMMISSION_RATE', 0.05),

  /**
   * Số ngày giữ tiền TỐI THIỂU sau khi giao thành công rồi mới cho rút.
   * Chi tiền ngay là mất khả năng hoàn tiền cho khách.
   *
   * 🔴 KHÔNG phải là toàn bộ cửa sổ giữ tiền: nếu `returnWindowDays` dài hơn,
   * tiền phải giữ tới hết cửa sổ trả hàng (xem `PayoutService.holdCutoff`).
   * Rút trước khi hết hạn trả hàng thì đến lúc duyệt trả hàng, tiền đã sang tay
   * người bán và không đòi lại được.
   */
  payoutHoldDays: optionalNumber('PAYOUT_HOLD_DAYS', 3),

  /**
   * Số ngày kể từ lúc giao thành công mà người mua còn được yêu cầu trả hàng.
   * Cũng là cận dưới của thời gian giữ tiền người bán (xem chú thích trên).
   */
  returnWindowDays: optionalNumber('RETURN_WINDOW_DAYS', 7),

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
