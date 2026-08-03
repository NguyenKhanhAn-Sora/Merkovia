"use client";

import { useEffect, useRef } from "react";
import { CircleNotch, Warning, X, type Icon } from "@phosphor-icons/react";
import { GhostButton } from "./ui";

type Tone = "danger" | "primary";

const TONE_STYLES: Record<Tone, { ring: string; icon: string; button: string }> = {
  danger: {
    ring: "border-rose-500/25 bg-rose-500/10",
    icon: "text-rose-400",
    button:
      "bg-rose-500 text-white hover:bg-rose-400 shadow-[0_10px_28px_-10px_rgba(244,63,94,0.6)]",
  },
  primary: {
    ring: "border-cosmic-violet/25 bg-cosmic-violet/10",
    icon: "text-cosmic-violet",
    button:
      "bg-gradient-to-r from-cosmic-blue via-cosmic-violet to-cosmic-fuchsia text-black/85 shadow-[0_10px_28px_-10px_rgba(14,165,233,0.55)]",
  },
};

/**
 * Hộp thoại xác nhận dùng chung cho các hành động khó hoàn tác — thay
 * `window.confirm` — vừa lạc tông giao diện, vừa không nói rõ được hậu quả
 * của hành động.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
  tone = "danger",
  icon: IconCmp = Warning,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  icon?: Icon;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cancelRef = useRef<HTMLDivElement>(null);

  // Esc để đóng — nhưng không cho đóng giữa chừng khi đang xử lý.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  // Đưa focus vào vùng huỷ để phím Tab/Enter không lỡ tay chạm nút phá huỷ.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;
  const styles = TONE_STYLES[tone];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
        aria-hidden
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-[420px] rounded-2xl border border-white/10 bg-[rgba(4,10,18,0.97)] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      >
        <button
          type="button"
          onClick={() => !busy && onClose()}
          aria-label="Đóng"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-star/45 transition-colors hover:bg-white/5 hover:text-star"
        >
          <X size={17} weight="bold" />
        </button>

        <div
          className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border ${styles.ring}`}
        >
          <IconCmp size={24} weight="fill" className={styles.icon} />
        </div>

        <h2 className="text-[17px] font-semibold text-star">{title}</h2>
        {description && (
          <div className="mt-2 text-[13.5px] leading-relaxed text-star/60">
            {description}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <div ref={cancelRef} tabIndex={-1} className="outline-none">
            <GhostButton onClick={onClose} disabled={busy}>
              {cancelLabel}
            </GhostButton>
          </div>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[14px] font-semibold transition-all duration-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${styles.button}`}
          >
            {busy && <CircleNotch size={16} className="animate-spin" />}
            {busy ? "Đang xử lý…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
