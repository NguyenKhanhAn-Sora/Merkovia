"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { keepAliveRefresh } from "./auth-api";

/**
 * Cân bằng hai yêu cầu ngược nhau của một phiên admin:
 *  1. Đang làm việc thật thì KHÔNG được văng ra giữa chừng chỉ vì access
 *     token (15 phút) hết hạn — một tác vụ dài hơn thế là chuyện bình thường.
 *  2. Nhưng phiên admin có toàn quyền hệ thống thì KHÔNG được sống vô thời
 *     hạn chỉ vì tab còn mở — rời máy mà quên khoá màn hình là rủi ro thật.
 *
 * Giải quyết bằng cách tách hai khái niệm: "tab đang mở" và "admin đang thật
 * sự dùng" (có tương tác chuột/bàn phím gần đây). Còn tương tác + tab hiện →
 * âm thầm gia hạn theo chu kỳ, dưới ngưỡng hết hạn của access token. Hết
 * tương tác quá lâu → dừng gia hạn, cảnh báo đếm ngược, hết giờ thì tự đăng
 * xuất — đúng kiểu khoá màn hình sau một thời gian không dùng.
 */

/** Dưới hạn access token (900s) để luôn gia hạn trước khi nó thật sự hết hạn. */
const PROACTIVE_REFRESH_MS = 10 * 60 * 1000; // 10 phút
/** Không thao tác trong ngần này thì coi là admin đã rời máy. */
const IDLE_WARNING_MS = 20 * 60 * 1000; // 20 phút
/** Sau khi cảnh báo, còn ngần này để xác nhận "vẫn đang dùng" trước khi tự đăng xuất. */
const IDLE_COUNTDOWN_S = 60;
/** Tần suất kiểm tra thời gian rảnh — không cần mịn hơn vài giây. */
const IDLE_CHECK_MS = 15_000;

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "wheel",
] as const;

export function useIdleSession(onForceLogout: () => void) {
  // Khởi tạo bằng 0 (giá trị thuần, không gọi hàm không tinh khiết lúc
  // render) — mốc thời gian thật được gán ngay khi mount, xem effect dưới.
  const lastActivity = useRef(0);
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(IDLE_COUNTDOWN_S);

  const markActive = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  useEffect(() => {
    markActive();
  }, [markActive]);

  // Ghi nhận hoạt động thật — CỐ Ý tắt trong lúc đang cảnh báo: một cử động
  // chuột tình cờ không được âm thầm huỷ cảnh báo, phải bấm "Tiếp tục" rõ ràng.
  useEffect(() => {
    if (warning) return;
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActive));
    };
  }, [warning, markActive]);

  // Vòng kiểm tra rảnh tay — tab ẩn thì bỏ qua (không tính giờ rảnh khi
  // không xem, cũng không lãng phí request gia hạn cho một tab nền bị quên).
  useEffect(() => {
    const check = setInterval(() => {
      if (document.visibilityState !== "visible" || warning) return;
      if (Date.now() - lastActivity.current >= IDLE_WARNING_MS) {
        setSecondsLeft(IDLE_COUNTDOWN_S);
        setWarning(true);
      }
    }, IDLE_CHECK_MS);
    return () => clearInterval(check);
  }, [warning]);

  // Gia hạn ngầm định kỳ trong lúc còn hoạt động thật — nếu bản thân lần gia
  // hạn này thất bại (refresh token cũng đã chết) thì đăng xuất ngay, không
  // đợi tới lần gọi API thật tiếp theo mới phát hiện ra.
  useEffect(() => {
    const tick = setInterval(() => {
      if (document.visibilityState !== "visible" || warning) return;
      if (Date.now() - lastActivity.current >= IDLE_WARNING_MS) return;
      void keepAliveRefresh().then((ok) => {
        if (!ok) onForceLogout();
      });
    }, PROACTIVE_REFRESH_MS);
    return () => clearInterval(tick);
  }, [warning, onForceLogout]);

  // Đếm ngược khi đang cảnh báo — hết giờ thì buộc đăng xuất.
  useEffect(() => {
    if (!warning) return;
    if (secondsLeft <= 0) {
      onForceLogout();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [warning, secondsLeft, onForceLogout]);

  /** Admin bấm "Tiếp tục làm việc" — xác minh phiên còn sống thật rồi mới đóng cảnh báo. */
  const extend = useCallback(async () => {
    const ok = await keepAliveRefresh();
    if (!ok) {
      onForceLogout();
      return;
    }
    markActive();
    setWarning(false);
  }, [markActive, onForceLogout]);

  return { warning, secondsLeft, extend };
}
