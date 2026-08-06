"use client";

import { useEffect, useState } from "react";
import { CheckCircle, CircleNotch, X, XCircle } from "@phosphor-icons/react";
import {
  respondDispute,
  CANCEL_REASON_LABEL,
  RETURN_REASON_LABEL,
  type OrderDisputeItem,
} from "../../lib/order-disputes-api";
import { formatVnd } from "./ui";

/** Duyệt/từ chối một tranh chấp huỷ/trả hàng của gian hàng đang bị đình chỉ. */
export default function DisputeModal({
  dispute,
  onClose,
  onResolved,
}: {
  dispute: OrderDisputeItem;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const reasonLabels = dispute.type === "cancel" ? CANCEL_REASON_LABEL : RETURN_REASON_LABEL;
  const reasonText = dispute.reasonType
    ? (reasonLabels[dispute.reasonType] ?? dispute.reasonType)
    : undefined;

  async function submit() {
    if (!decision) return;
    if (decision === "reject" && note.trim().length < 10) {
      setError("Vui lòng ghi rõ lý do từ chối (ít nhất 10 ký tự) — nội dung này gửi cho người mua.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await respondDispute(dispute.orderId, dispute.type, decision === "approve", note.trim() || undefined);
      onResolved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-[520px] rounded-2xl border border-white/10 bg-[rgba(4,10,18,0.97)] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-star">
              {dispute.type === "cancel" ? "Yêu cầu huỷ đơn" : "Yêu cầu trả hàng"} — {dispute.orderCode}
            </h2>
            <p className="mt-1 text-[12.5px] text-star/50">
              Gian hàng &ldquo;{dispute.shopName}&rdquo; đang bị đình chỉ — bạn xử lý thay.
            </p>
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

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[13px]">
          <div className="flex flex-wrap justify-between gap-2 text-star/70">
            <span>Người mua: {dispute.buyerContact}</span>
            <span className="font-medium text-star/85">{formatVnd(dispute.total)}</span>
          </div>
          {reasonText && (
            <p className="mt-2 text-star/60">
              Lý do: <span className="text-star/85">{reasonText}</span>
            </p>
          )}
          {dispute.reason && (
            <p className="mt-1.5 leading-relaxed text-star/55">{dispute.reason}</p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setDecision("approve");
              setError("");
            }}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
              decision === "approve"
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 bg-white/[0.03] text-star/70 hover:border-white/20"
            }`}
          >
            <CheckCircle size={16} weight="fill" />
            Duyệt (hoàn tiền)
          </button>
          <button
            type="button"
            onClick={() => {
              setDecision("reject");
              setError("");
            }}
            className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors ${
              decision === "reject"
                ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
                : "border-white/10 bg-white/[0.03] text-star/70 hover:border-white/20"
            }`}
          >
            <XCircle size={16} weight="fill" />
            Từ chối
          </button>
        </div>

        {decision && (
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setError("");
            }}
            placeholder={
              decision === "reject"
                ? "Bắt buộc: lý do từ chối, gửi cho người mua…"
                : "Ghi chú thêm (không bắt buộc)…"
            }
            rows={3}
            maxLength={500}
            className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-[13.5px] leading-relaxed text-star placeholder:text-star/30 outline-none transition-colors focus:border-cosmic-violet/50"
          />
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
            Đóng
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !decision}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-cosmic-blue via-cosmic-violet to-cosmic-fuchsia px-5 text-[13.5px] font-semibold text-black/85 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy && <CircleNotch size={15} className="animate-spin" />}
            {busy ? "Đang xử lý…" : "Xác nhận"}
          </button>
        </div>
      </div>
    </div>
  );
}
