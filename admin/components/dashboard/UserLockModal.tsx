"use client";

import { useState } from "react";
import { CircleNotch, LockKey, Prohibit, ShieldWarning, X } from "@phosphor-icons/react";
import {
  lockUser,
  unlockUser,
  type AdminUserListItem,
  type LockScope,
} from "../../lib/users-api";

const SCOPE_OPTIONS: { value: LockScope; label: string; hint: string; icon: typeof ShieldWarning }[] = [
  {
    value: "buyer",
    label: "Cấm mua",
    hint: "Chỉ chặn app Người mua — vẫn bán bình thường nếu đang có shop.",
    icon: ShieldWarning,
  },
  {
    value: "seller",
    label: "Cấm bán",
    hint: "Chặn đăng nhập app Người bán (khác đình chỉ shop — vẫn mua bình thường).",
    icon: Prohibit,
  },
  {
    value: "all",
    label: "Khoá toàn bộ",
    hint: "Chặn đăng nhập MỌI app — dùng cho vấn đề danh tính (gian lận, lộ mật khẩu...).",
    icon: LockKey,
  },
];

/** Quản lý khoá/gỡ khoá MỘT tài khoản — 3 mức độc lập (mua / bán / toàn bộ). */
export default function UserLockModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUserListItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const [scope, setScope] = useState<LockScope | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const isAllLocked = user.status === "suspended";
  const active: { scope: LockScope; label: string }[] = [
    ...(isAllLocked ? [{ scope: "all" as LockScope, label: "Khoá toàn bộ" }] : []),
    ...(!isAllLocked && user.buyerLocked ? [{ scope: "buyer" as LockScope, label: "Cấm mua" }] : []),
    ...(!isAllLocked && user.sellerLocked ? [{ scope: "seller" as LockScope, label: "Cấm bán" }] : []),
  ];
  // Toàn bộ đã khoá thì các hạn chế riêng lẻ vô nghĩa để thêm mới.
  const addableOptions = isAllLocked ? [] : SCOPE_OPTIONS;

  async function doUnlock(s: LockScope) {
    setBusy(`unlock-${s}`);
    setError("");
    try {
      await unlockUser(user.id, s);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      setBusy(null);
    }
  }

  async function doLock() {
    if (!scope) return;
    if (reason.trim().length < 5) {
      setError("Vui lòng nêu lý do (ít nhất 5 ký tự) — nội dung này gửi cho người dùng qua email.");
      return;
    }
    setBusy("lock");
    setError("");
    try {
      await lockUser(user.id, reason.trim(), scope);
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !busy && onClose()} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-[520px] rounded-2xl border border-white/10 bg-[rgba(4,10,18,0.97)] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-star">Quản lý khoá tài khoản</h2>
            <p className="truncate text-[12.5px] text-star/50">{user.name || user.email || user.phone}</p>
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

        {active.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-[12px] font-medium text-star/60">Đang bị hạn chế</p>
            <div className="flex flex-wrap gap-2">
              {active.map((a) => (
                <span
                  key={a.scope}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 py-1 pl-3 pr-1.5 text-[12.5px] text-rose-200"
                >
                  {a.label}
                  <button
                    type="button"
                    onClick={() => void doUnlock(a.scope)}
                    disabled={busy !== null}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-40"
                    aria-label={`Gỡ ${a.label}`}
                  >
                    {busy === `unlock-${a.scope}` ? <CircleNotch size={11} className="animate-spin" /> : <X size={11} weight="bold" />}
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {addableOptions.length > 0 && (
          <>
            <p className="mb-2 text-[12px] font-medium text-star/60">
              {active.length > 0 ? "Thêm hạn chế mới" : "Chọn mức khoá"}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {addableOptions
                .filter((o) => !active.some((a) => a.scope === o.value))
                .map((opt) => {
                  const Icon = opt.icon;
                  const selected = scope === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setScope(opt.value);
                        setError("");
                      }}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? "border-rose-500/50 bg-rose-500/10"
                          : "border-white/10 bg-white/[0.03] hover:border-white/20"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-star">
                        <Icon size={15} weight="fill" />
                        {opt.label}
                      </span>
                      <span className="mt-1 block text-[11.5px] leading-snug text-star/45">{opt.hint}</span>
                    </button>
                  );
                })}
            </div>

            {scope && (
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError("");
                }}
                placeholder="Bắt buộc: lý do, gửi cho người dùng qua email…"
                rows={3}
                maxLength={500}
                className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-[13.5px] leading-relaxed text-star placeholder:text-star/30 outline-none transition-colors focus:border-cosmic-violet/50"
              />
            )}
          </>
        )}

        {isAllLocked && (
          <p className="text-[13px] leading-relaxed text-star/55">
            Tài khoản đang bị khoá toàn bộ — gỡ khoá toàn bộ trước nếu muốn chuyển sang hạn chế riêng từng vai trò.
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
            disabled={busy !== null}
            className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[13.5px] font-medium text-star/70 transition-colors hover:border-white/20 hover:text-star disabled:opacity-45"
          >
            Đóng
          </button>
          {scope && (
            <button
              type="button"
              onClick={() => void doLock()}
              disabled={busy !== null}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-500 px-5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy === "lock" && <CircleNotch size={15} className="animate-spin" />}
              {busy === "lock" ? "Đang xử lý…" : "Áp dụng khoá"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
