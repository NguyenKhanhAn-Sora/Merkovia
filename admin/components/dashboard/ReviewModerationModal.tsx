"use client";

import { useState } from "react";
import {
  ChatCircleText,
  CircleNotch,
  Eye,
  EyeSlash,
  Package,
  PlayCircle,
  Star,
  Warning,
  X,
} from "@phosphor-icons/react";
import {
  hideReview,
  hideReviewReply,
  unhideReview,
  unhideReviewReply,
  type AdminReviewItem,
} from "../../lib/reviews-api";
import { Badge } from "./ui";
import MediaLightbox from "./MediaLightbox";

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-400">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={14} weight={i < value ? "fill" : "regular"} className={i < value ? "" : "text-star/20"} />
      ))}
    </span>
  );
}

/** Ẩn/gỡ ẩn có lý do bắt buộc — dùng chung cho cả khối đánh giá và khối phản hồi. */
function HideControl({
  hidden,
  busy,
  onHide,
  onUnhide,
  hideLabel,
  unhideLabel,
}: {
  hidden: boolean;
  busy: boolean;
  onHide: (reason: string) => Promise<void>;
  onUnhide: () => Promise<void>;
  hideLabel: string;
  unhideLabel: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  if (hidden) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void onUnhide()}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 text-[13px] font-medium text-emerald-300 transition-colors hover:border-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <CircleNotch size={14} className="animate-spin" /> : <Eye size={14} weight="bold" />}
        {unhideLabel}
      </button>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 text-[13px] font-medium text-rose-300 transition-colors hover:border-rose-500/50"
      >
        <EyeSlash size={14} weight="bold" />
        {hideLabel}
      </button>
    );
  }

  return (
    <div className="mt-1 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] p-3">
      <textarea
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          setError("");
        }}
        placeholder="Bắt buộc: lý do ẩn, gửi cho tác giả…"
        rows={2}
        maxLength={300}
        autoFocus
        className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] leading-relaxed text-star placeholder:text-star/30 outline-none transition-colors focus:border-rose-500/50"
      />
      {error && <p className="mt-1.5 text-[12px] text-rose-300">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setConfirming(false);
            setReason("");
            setError("");
          }}
          className="h-8 rounded-lg px-3 text-[12.5px] text-star/55 transition-colors hover:text-star/80"
        >
          Huỷ
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (reason.trim().length < 5) {
              setError("Lý do cần ít nhất 5 ký tự.");
              return;
            }
            await onHide(reason.trim());
            setConfirming(false);
            setReason("");
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-500/90 px-3 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <CircleNotch size={13} className="animate-spin" />}
          Xác nhận ẩn
        </button>
      </div>
    </div>
  );
}

/** Chi tiết một đánh giá cho admin kiểm duyệt — ẩn/gỡ ẩn đánh giá và phản hồi ĐỘC LẬP nhau. */
export default function ReviewModerationModal({
  review,
  onClose,
  onChanged,
}: {
  review: AdminReviewItem;
  onClose: () => void;
  onChanged: (updated: AdminReviewItem) => void;
}) {
  const [busyReview, setBusyReview] = useState(false);
  const [busyReply, setBusyReply] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [errorReview, setErrorReview] = useState("");
  const [errorReply, setErrorReply] = useState("");

  async function doHideReview(reason: string) {
    setBusyReview(true);
    setErrorReview("");
    try {
      const { review: updated } = await hideReview(review.id, reason);
      onChanged(updated);
    } catch (e) {
      setErrorReview(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      setBusyReview(false);
    }
  }

  async function doUnhideReview() {
    setBusyReview(true);
    setErrorReview("");
    try {
      const { review: updated } = await unhideReview(review.id);
      onChanged(updated);
    } catch (e) {
      setErrorReview(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      setBusyReview(false);
    }
  }

  async function doHideReply(reason: string) {
    setBusyReply(true);
    setErrorReply("");
    try {
      const { review: updated } = await hideReviewReply(review.id, reason);
      onChanged(updated);
    } catch (e) {
      setErrorReply(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      setBusyReply(false);
    }
  }

  async function doUnhideReply() {
    setBusyReply(true);
    setErrorReply("");
    try {
      const { review: updated } = await unhideReviewReply(review.id);
      onChanged(updated);
    } catch (e) {
      setErrorReply(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      setBusyReply(false);
    }
  }

  const r = review;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(4,10,18,0.97)] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-6 py-4">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-star">{r.product.name}</p>
            <p className="mt-0.5 truncate text-[12.5px] text-star/50">
              Gian hàng &ldquo;{r.shop.name}&rdquo; · Đơn {r.order.orderCode}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {r.hidden && <Badge tone="danger">Đã ẩn</Badge>}
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-star/45 transition-colors hover:bg-white/5 hover:text-star"
            >
              <X size={17} weight="bold" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[13px]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.05] text-star/30">
              {r.product.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.product.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <Package size={16} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-star/80">
                {r.anonymous ? `${r.buyer.name} (ẩn danh)` : r.buyer.name}
                <span className="text-star/40"> · {r.buyer.contact}</span>
              </p>
              <p className="mt-0.5 text-star/45">
                {r.variantLabel || "—"} · {fmtDate(r.createdAt)}
              </p>
            </div>
          </div>

          {/* Khối đánh giá của buyer */}
          <div className="mb-5">
            <Stars value={r.rating} />
            {r.comment && (
              <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-star/80">{r.comment}</p>
            )}
            {r.media.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {r.media.map((m, i) => (
                  <button
                    key={m.url + i}
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                    aria-label={`Xem ${m.kind === "video" ? "video" : "ảnh"} ${i + 1} toàn màn hình`}
                    className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] text-star/60 transition-colors hover:border-white/25"
                  >
                    {m.kind === "video" ? (
                      <PlayCircle size={22} weight="fill" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt="" className="h-full w-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {r.hidden && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] leading-relaxed text-star/80">
                <Warning size={16} weight="fill" className="mt-0.5 shrink-0 text-rose-400" />
                <span>
                  Đã ẩn bởi {r.hiddenBy ?? "admin"} lúc {fmtDate(r.hiddenAt)}. Lý do: {r.hiddenReason}
                </span>
              </p>
            )}

            <div className="mt-3">
              <HideControl
                hidden={r.hidden}
                busy={busyReview}
                onHide={doHideReview}
                onUnhide={doUnhideReview}
                hideLabel="Ẩn đánh giá"
                unhideLabel="Gỡ ẩn đánh giá"
              />
              {errorReview && <p className="mt-2 text-[12.5px] text-rose-300">{errorReview}</p>}
            </div>
          </div>

          {/* Khối phản hồi của shop — ẩn/gỡ ẩn ĐỘC LẬP với đánh giá phía trên */}
          {r.reply && (
            <div className="border-t border-white/[0.07] pt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-medium text-star/60">
                <ChatCircleText size={14} />
                Phản hồi của gian hàng — {fmtDate(r.repliedAt)}
              </p>
              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-star/75">{r.reply}</p>

              {r.replyHidden && (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] leading-relaxed text-star/80">
                  <Warning size={16} weight="fill" className="mt-0.5 shrink-0 text-rose-400" />
                  <span>
                    Phản hồi đã ẩn bởi {r.replyHiddenBy ?? "admin"} lúc {fmtDate(r.replyHiddenAt)}. Lý do:{" "}
                    {r.replyHiddenReason}
                  </span>
                </p>
              )}

              <div className="mt-3">
                <HideControl
                  hidden={r.replyHidden}
                  busy={busyReply}
                  onHide={doHideReply}
                  onUnhide={doUnhideReply}
                  hideLabel="Ẩn phản hồi"
                  unhideLabel="Gỡ ẩn phản hồi"
                />
                {errorReply && <p className="mt-2 text-[12.5px] text-rose-300">{errorReply}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-white/[0.07] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[13.5px] font-medium text-star/70 transition-colors hover:border-white/20 hover:text-star"
          >
            Đóng
          </button>
        </div>
      </div>

      <MediaLightbox
        items={r.media}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </div>
  );
}
