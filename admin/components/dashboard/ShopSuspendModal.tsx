"use client";

import { useState } from "react";
import { CircleNotch, Prohibit, ShieldCheck, X } from "@phosphor-icons/react";
import { suspendShop, unsuspendShop, type AdminShopListItem } from "../../lib/shops-api";

const SUSPEND_DURATION_OPTIONS: { value: number | undefined; label: string }[] = [
  { value: 7, label: "7 ngày" },
  { value: 14, label: "14 ngày" },
  { value: 30, label: "30 ngày" },
  { value: 90, label: "90 ngày" },
  { value: undefined, label: "Vô thời hạn" },
];

/** Đình chỉ hoặc gỡ đình chỉ MỘT gian hàng — trực tiếp, không cần report làm căn cứ. */
export default function ShopSuspendModal({
  shop,
  mode,
  onClose,
  onDone,
}: {
  shop: AdminShopListItem;
  mode: "suspend" | "unsuspend";
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [suspendDays, setSuspendDays] = useState<number | undefined>(7);
  const [durationTouched, setDurationTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isSuspend = mode === "suspend";

  async function submit() {
    if (isSuspend) {
      if (reason.trim().length < 5) {
        setError("Vui lòng nêu lý do đình chỉ (ít nhất 5 ký tự) — nội dung này gửi cho gian hàng.");
        return;
      }
      if (!durationTouched) {
        setError("Vui lòng chọn thời hạn đình chỉ.");
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      if (isSuspend) await suspendShop(shop.id, reason.trim(), suspendDays);
      else await unsuspendShop(shop.id);
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      setBusy(false);
    }
  }

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
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isSuspend ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"}`}
            >
              {isSuspend ? <Prohibit size={17} weight="fill" /> : <ShieldCheck size={17} weight="fill" />}
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-star">
                {isSuspend ? "Đình chỉ gian hàng" : "Gỡ đình chỉ gian hàng"}
              </h2>
              <p className="truncate text-[12.5px] text-star/50">{shop.name}</p>
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

        {isSuspend ? (
          <>
            <p className="mb-3 text-[13px] leading-relaxed text-star/60">
              Gian hàng sẽ không thể đăng bán sản phẩm mới, nhận thanh toán hay chạy khuyến mãi cho đến khi được gỡ.
            </p>
            <p className="mb-1.5 text-[12px] font-medium text-star/60">Thời hạn đình chỉ</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {SUSPEND_DURATION_OPTIONS.map((opt) => {
                const selected = durationTouched && suspendDays === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      setSuspendDays(opt.value);
                      setDurationTouched(true);
                      setError("");
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                      selected
                        ? "border-cosmic-violet/50 bg-cosmic-violet/10 text-star"
                        : "border-white/10 bg-white/[0.03] text-star/60 hover:border-white/20"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError("");
              }}
              placeholder="Bắt buộc: lý do đình chỉ, gửi cho gian hàng…"
              rows={3}
              maxLength={500}
              className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-[13.5px] leading-relaxed text-star placeholder:text-star/30 outline-none transition-colors focus:border-cosmic-violet/50"
            />
          </>
        ) : (
          <p className="mb-1 text-[13px] leading-relaxed text-star/60">
            Gian hàng sẽ hoạt động lại bình thường ngay lập tức.
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
              isSuspend ? "bg-rose-500 text-white" : "bg-gradient-to-r from-cosmic-blue via-cosmic-violet to-cosmic-fuchsia text-black/85"
            }`}
          >
            {busy && <CircleNotch size={15} className="animate-spin" />}
            {busy ? "Đang xử lý…" : isSuspend ? "Đình chỉ" : "Gỡ đình chỉ"}
          </button>
        </div>
      </div>
    </div>
  );
}
