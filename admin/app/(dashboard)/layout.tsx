"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SignOut, Timer } from "@phosphor-icons/react";
import ConfirmDialog from "../../components/dashboard/ConfirmDialog";
import Sidebar from "../../components/dashboard/Sidebar";
import Topbar from "../../components/dashboard/Topbar";
import { clearAdmin, getAdmin, saveAdmin, type AdminUser } from "../../lib/session";
import { loadAdminSession, logout } from "../../lib/auth-api";
import { useIdleSession } from "../../lib/use-idle-session";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    const a = getAdmin();
    if (!a) {
      router.replace("/login");
      return;
    }

    // Cache sessionStorage KHÔNG chứng minh phiên còn sống — cookie có thể đã
    // hết hạn (token admin sống rất ngắn). Phải hỏi server (tự gia hạn ngầm
    // nếu access token hết hạn); nếu phiên chết hẳn thì apiFetch tự đưa về
    // /login thay vì hiện dashboard rỗng.
    void loadAdminSession().then(({ alive, admin: current }) => {
      if (!alive) return; // đang được điều hướng sang /login
      if (current) saveAdmin(current);
      setAdmin(current ?? a);
      setChecked(true);
    });
  }, [router]);

  /**
   * Đăng xuất "cứng": chờ server thu hồi phiên xong mới dọn cache cục bộ rồi
   * điều hướng bằng `window.location` thay vì router của Next.
   *
   * 🔴 Vì sao không dùng `router.replace`: điều hướng client-side giữ nguyên
   * toàn bộ cây React (state/closure cũ) trong bộ nhớ trình duyệt và có thể
   * được phục hồi qua bfcache khi bấm Back — với một tài khoản có toàn quyền
   * hệ thống, rủi ro lộ dữ liệu còn sót trên màn hình lớn hơn buyer/seller
   * nhiều. `window.location.replace` buộc tải lại trang trắng, xoá sạch mọi
   * state/cây component cũ, và không để lại entry trong lịch sử để bấm Back
   * quay lại dashboard.
   *
   * `reason="idle"` (tự động đăng xuất do rời máy quá lâu) gắn `?expired=1`
   * để trang đăng nhập giải thích lý do; bấm "Đăng xuất" chủ động thì không
   * cần vì admin đã biết rõ mình vừa làm gì.
   */
  const handleConfirmLogout = useCallback(async (reason?: "idle") => {
    setLoggingOut(true);
    await logout(); // xoá cookie httpOnly + thu hồi MỌI token đã phát phía server
    clearAdmin(); // dọn sạch sessionStorage cục bộ
    window.location.replace(reason === "idle" ? "/login?expired=1" : "/login");
  }, []);

  const forceLogoutIdle = useCallback(() => {
    void handleConfirmLogout("idle");
  }, [handleConfirmLogout]);

  const { warning: idleWarning, secondsLeft, extend } = useIdleSession(forceLogoutIdle);

  const handleExtend = useCallback(async () => {
    setExtending(true);
    await extend();
    setExtending(false);
  }, [extend]);

  if (!checked || !admin) return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10 bg-void" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.14),transparent_45%),radial-gradient(circle_at_82%_0%,rgba(45,212,191,0.1),transparent_40%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.1),transparent_55%)]" />
      </div>

      <Sidebar
        admin={admin}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onLogout={() => setLogoutConfirmOpen(true)}
      />

      <div className="min-h-[100dvh] lg:pl-[264px]">
        <Topbar
          admin={admin}
          onOpenMenu={() => setMenuOpen(true)}
          onLogout={() => setLogoutConfirmOpen(true)}
        />
        <main className="mx-auto w-full max-w-[1200px] px-4 py-7 sm:px-6 sm:py-9">
          {children}
        </main>
      </div>

      <ConfirmDialog
        open={logoutConfirmOpen}
        title="Đăng xuất khỏi Quản trị?"
        description="Toàn bộ phiên đăng nhập hiện tại sẽ bị thu hồi ngay lập tức, kể cả trên các tab hoặc thiết bị khác. Bạn sẽ cần đăng nhập lại để tiếp tục."
        confirmLabel="Đăng xuất"
        icon={SignOut}
        busy={loggingOut}
        onConfirm={() => void handleConfirmLogout()}
        onClose={() => !loggingOut && setLogoutConfirmOpen(false)}
      />

      {/* Cảnh báo không hoạt động — cả hai nút đều là "vẫn đang dùng", cố ý
          không cho đóng bằng Esc/click nền/nút X mà không xác nhận, để một
          cú chạm ngoài ý muốn không âm thầm gia hạn phiên hộ người khác. */}
      <ConfirmDialog
        open={idleWarning}
        title="Bạn có còn ở đây không?"
        description={`Không phát hiện thao tác trong một khoảng thời gian dài. Vì đây là tài khoản quản trị, phiên sẽ tự động đăng xuất sau ${secondsLeft} giây nếu không có phản hồi.`}
        confirmLabel="Tiếp tục làm việc"
        cancelLabel="Tôi vẫn ở đây"
        tone="primary"
        icon={Timer}
        busy={extending}
        onConfirm={() => void handleExtend()}
        onClose={() => void handleExtend()}
      />
    </>
  );
}
