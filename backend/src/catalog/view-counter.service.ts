import { Injectable } from '@nestjs/common';
import { config } from '../config/config';

/**
 * Chống đếm view trùng: mỗi (sản phẩm × người xem) chỉ tính MỘT lần trong cửa
 * sổ `dedupSeconds`. Nhờ vậy refresh liên tục hay gọi API lặp không thổi phồng
 * được số view.
 *
 * Lưu trong RAM (giống kho OTP, cache tìm kiếm): đủ cho một tiến trình. Nếu sau
 * này chạy nhiều instance thì chuyển map này sang Redis — phần còn lại giữ nguyên.
 */
@Injectable()
export class ViewCounterService {
  /** key = `${productId}:${viewerKey}` → thời điểm hết hạn (epoch ms). */
  private readonly seen = new Map<string, number>();
  private readonly windowMs = config.view.dedupSeconds * 1000;
  private lastSweep = 0;

  /**
   * `true` nếu NÊN +1 view cho người xem này (chưa tính trong cửa sổ hiện tại);
   * đồng thời ghi nhận để lần sau trong cửa sổ trả `false`.
   */
  shouldCount(productId: string, viewerKey: string): boolean {
    const key = `${productId}:${viewerKey}`;
    const now = Date.now();
    this.sweep(now);

    const expiry = this.seen.get(key);
    if (expiry && expiry > now) return false; // đã đếm, còn trong cửa sổ

    this.seen.set(key, now + this.windowMs);
    return true;
  }

  /** Dọn khoá hết hạn định kỳ để map không phình vô hạn. */
  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, expiry] of this.seen) {
      if (expiry <= now) this.seen.delete(k);
    }
  }
}
