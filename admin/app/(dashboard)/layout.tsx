"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "../../components/dashboard/Topbar";
import { clearAdmin, getAdmin, saveAdmin, type AdminUser } from "../../lib/session";
import { loadAdminSession, logout } from "../../lib/auth-api";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [checked, setChecked] = useState(false);

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

  const onLogout = useCallback(async () => {
    await logout(); // xoá cookie httpOnly + thu hồi token phía server
    clearAdmin();
    router.replace("/login");
  }, [router]);

  if (!checked || !admin) return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10 bg-void" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.14),transparent_45%),radial-gradient(circle_at_82%_0%,rgba(45,212,191,0.1),transparent_40%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.1),transparent_55%)]" />
      </div>

      <Topbar admin={admin} onLogout={() => void onLogout()} />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-7 sm:px-6 sm:py-9">
        {children}
      </main>
    </>
  );
}
