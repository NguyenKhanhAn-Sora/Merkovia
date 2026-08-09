"use client";

import { useState } from "react";
import { CircleNotch, LockKey, LockKeyOpen, X } from "@phosphor-icons/react";
import { lockUser, unlockUser, type AdminUserListItem } from "../../lib/users-api";

/** Khoá hoặc gỡ khoá MỘT tài khoản. `mode` quyết định form hiện ra. */
export default function UserLockModal({
  user,
  mode,
  onClose,
  onDone,
}: {
  user: AdminUserListItem;
  mode: "lock" | "unlock";
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (mode === "lock" && reason.trim().length < 5) {
      setError("Vui lòng nêu lý do khoá tài khoản (ít nhất 5 ký tự) — nội dung này gửi cho người dùng qua email.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (mode === "lock") await lockUser(user.id, reason.trim());
      else await unlockUser(user.id);
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      setBusy(false);
    }
  }

  const isLock = mode === "lock";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !busy && onClose()} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-[480px] rounded-2xl border border-white/10 bg-[rgba(4,10,18,0.97)] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isLock ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"}`}
            >
              {isLock ? <LockKey size={17} weight="fill" /> : <LockKeyOpen size={17} weight="fill" />}
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-star">
                {isLock ? "Khoá tài khoản" : "Gỡ khoá tài khoản"}
              </h2>
              <p className="truncate text-[12.5px] text-star/50">{user.name || user.email || user.phone}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Đóng"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-star/45 transition-colors hover:bg-white/5 hover:text-star"
          >
            <X size={17} weight="bold" />
          </button>
        </div>

        {isLock ? (
          <>
            <p className="mb-3 text-[13px] leading-relaxed text-star/60">
              Người dùng sẽ bị đăng xuất khỏi mọi phiên và không đăng nhập lại được cho đến khi gỡ khoá.
              {user.shop && ' Gian hàng của họ (nếu đang hoạt động) sẽ tự động bị đình chỉ theo.'}
            </p>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError("");
              }}
              placeholder="Bắt buộc: lý do khoá, gửi cho người dùng qua email…"
              rows={3}
              maxLength={500}
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-[13.5px] leading-relaxed text-star placeholder:text-star/30 outline-none transition-colors focus:border-cosmic-violet/50"
            />
          </>
        ) : (
          <p className="mb-1 text-[13px] leading-relaxed text-star/60">
            Người dùng sẽ đăng nhập lại được ngay. Gian hàng (nếu đang bị đình chỉ) sẽ KHÔNG tự động gỡ theo —
            vào trang Gian hàng để xử lý riêng nếu phù hợp.
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[13px] text-rose-200">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[13.5px] font-medium text-star/70 transition-colors hover:border-white/20 hover:text-star disabled:opacity-45"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className={`inline-flex h-10 items-center gap-2 rounded-xl px-5 text-[13.5px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 ${
              isLock ? "bg-rose-500 text-white" : "bg-gradient-to-r from-cosmic-blue via-cosmic-violet to-cosmic-fuchsia text-black/85"
            }`}
          >
            {busy && <CircleNotch size={15} className="animate-spin" />}
            {busy ? "Đang xử lý…" : isLock ? "Khoá tài khoản" : "Gỡ khoá"}
          </button>
        </div>
      </div>
    </div>
  );
}
