/** Phần local của số di động VN: đúng 9 chữ số (không tính số 0 đầu / mã +84). */
export const VN_LOCAL_PHONE_RE = /^\d{9}$/;

/**
 * Chuẩn hoá số VN về E.164: 9 chữ số local → +84XXXXXXXXX.
 * Chấp nhận cả dạng có '0' đầu hoặc '+84'/'84' đầu.
 */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length > 9) {
    // Chỉ bóc tiền tố khi độ dài dư ra (tránh cắt nhầm số local bắt đầu bằng '84').
    if (digits.startsWith('84')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = digits.slice(1);
  }
  return `+84${digits}`;
}
