"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Envelope,
  Eye,
  EyeSlash,
  LockKey,
  WarningCircle,
} from "@phosphor-icons/react";
import { AuthShell, GlassCard, Field, SubmitButton } from "../auth-ui";
import { loginAdmin } from "../../../lib/auth-api";
import { getAdmin, saveAdmin } from "../../../lib/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdminLoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  /** Bị đưa về đây vì phiên hết hạn — cần nói rõ để admin không hoang mang. */
  const [sessionExpired, setSessionExpired] = useState(false);
  /** Chưa kiểm tra xong phiên đăng nhập → chưa render form (tránh chớp form). */
  const [authChecked, setAuthChecked] = useState(false);

  // Đã đăng nhập mà vào /login → đẩy thẳng về dashboard (không cho thấy form).
  useEffect(() => {
    if (getAdmin()) {
      router.replace("/");
      return;
    }
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("expired")) setSessionExpired(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setLoginError("Vui lòng nhập email và mật khẩu.");
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setLoginError("Email không hợp lệ. Vui lòng nhập đúng định dạng.");
      return;
    }

    setLoggingIn(true);
    try {
      const res = await loginAdmin(trimmedEmail, password);
      saveAdmin(res.admin);
      router.push("/");
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Đăng nhập thất bại.");
      setLoggingIn(false);
    }
  };

  if (!authChecked) return null; // đang kiểm tra phiên → chưa hiện gì

  return (
    <AuthShell
      heading={
        <>
          Kiểm soát toàn bộ
          <br />
          thiên hà Merkovia.
        </>
      }
      subheading="Đăng nhập Quản trị để giám sát, vận hành và bảo vệ hệ thống Merkovia."
    >
      <GlassCard title="Đăng nhập quản trị" subtitle="Dành riêng cho tài khoản quản trị hệ thống.">
        {sessionExpired && (
          <div className="mb-6 flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] leading-relaxed text-star/80">
            <WarningCircle
              size={18}
              weight="fill"
              className="mt-0.5 shrink-0 text-amber-400"
            />
            <span>
              Phiên đăng nhập đã hết hạn do thời gian bảo mật ngắn của tài khoản
              quản trị. Vui lòng đăng nhập lại để tiếp tục.
            </span>
          </div>
        )}

        <form className="flex flex-col gap-5" onSubmit={handleLogin}>
          <Field
            id="email"
            type="email"
            inputMode="email"
            label="Email"
            placeholder="admin@merkovia.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Envelope size={19} weight="regular" />}
          />
          <Field
            id="password"
            type={showPassword ? "text" : "password"}
            label="Mật khẩu"
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<LockKey size={19} weight="regular" />}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-star/45 transition-colors hover:bg-white/5 hover:text-star/80"
              >
                {showPassword ? <EyeSlash size={19} /> : <Eye size={19} />}
              </button>
            }
          />

          {loginError && (
            <p className="flex items-center gap-1.5 text-[13px] text-rose-400">
              <WarningCircle size={15} weight="fill" className="shrink-0" />
              {loginError}
            </p>
          )}

          <SubmitButton disabled={loggingIn}>
            {loggingIn ? "Đang đăng nhập…" : "Đăng nhập"}
          </SubmitButton>
        </form>
      </GlassCard>

      <p className="mt-7 text-center text-[13px] text-star/40">
        Phiên đăng nhập quản trị có thời hạn ngắn để đảm bảo an toàn hệ thống.
      </p>
    </AuthShell>
  );
}
