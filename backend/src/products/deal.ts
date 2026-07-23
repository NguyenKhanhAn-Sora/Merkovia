/** Hình dạng tối thiểu của một khuyến mãi để xét còn hiệu lực hay không. */
export interface DealWindow {
  startsAt?: Date | null;
  endsAt: Date;
}

/**
 * Khuyến mãi có đang chạy tại thời điểm này không.
 *
 * 🔴 Chỉ có MỘT định nghĩa cho câu hỏi đó, dùng chung cho cả nơi hiển thị
 * (`catalog.service`) lẫn nơi tính tiền (`orders.service`). Hai nơi tự xét
 * riêng là kiểu lỗi tệ nhất của thương mại điện tử: người mua thấy giá sale
 * trên trang nhưng lúc trừ tiền lại ra giá gốc.
 *
 * `startsAt` để trống nghĩa là chạy ngay — khuyến mãi cũ tạo trước khi có
 * trường này vẫn hoạt động bình thường.
 */
export function isDealLive(
  deal?: DealWindow | null,
  now = Date.now(),
): boolean {
  if (!deal) return false;
  if (deal.startsAt && new Date(deal.startsAt).getTime() > now) return false;
  return new Date(deal.endsAt).getTime() > now;
}

/** Khuyến mãi đã hẹn giờ nhưng chưa tới lúc chạy. */
export function isDealScheduled(
  deal?: DealWindow | null,
  now = Date.now(),
): boolean {
  if (!deal?.startsAt) return false;
  return (
    new Date(deal.startsAt).getTime() > now &&
    new Date(deal.endsAt).getTime() > now
  );
}
