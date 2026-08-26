"use client";

import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api-fetch";

/**
 * MỘT kết nối socket dùng chung cho cả Kênh Quản trị — hiện chỉ phục vụ chat
 * hỗ trợ (CSKH), nhưng gộp sẵn theo đúng mô hình buyer/seller đã có: mở một
 * lần, ai cần thì đăng ký thêm sự kiện.
 *
 * `auth: {app: "admin"}` khớp `scopeFromSocket` phía backend — gateway xác
 * thực admin qua `AdminAuthService` (không có bản ghi `User`, chỉ MỘT tài
 * khoản gốc cấu hình qua `.env`), khác hẳn đường buyer/seller.
 */
let socket: Socket | null = null;
let refs = 0;

function ensure(): Socket {
  socket ??= io(API_URL, {
    withCredentials: true,
    auth: { app: "admin" },
    transports: ["websocket", "polling"],
  });
  return socket;
}

export function subscribe(
  event: string,
  handler: (payload: never) => void,
): () => void {
  const s = ensure();
  refs++;
  s.on(event, handler as (p: unknown) => void);

  let done = false;
  return () => {
    if (done) return;
    done = true;
    s.off(event, handler as (p: unknown) => void);
    refs--;
    if (refs <= 0) {
      s.close();
      socket = null;
      refs = 0;
    }
  };
}
