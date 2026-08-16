"use client";

import { useEffect, useState } from "react";
import {
  CircleNotch,
  Eye,
  Heart,
  Package,
  ShoppingBag,
  Star,
  Warning,
  X,
  XCircle,
} from "@phosphor-icons/react";
import {
  endPromotion,
  getPromotionDetail,
  type AdminPromotionDetail,
} from "../../lib/promotions-api";
import { Badge, formatVnd, type BadgeTone } from "./ui";
import ConfirmDialog from "./ConfirmDialog";

const STATE_BADGE: Record<AdminPromotionDetail["state"], { label: string; tone: BadgeTone }> = {
  live: { label: "Đang chạy", tone: "success" },
  scheduled: { label: "Sắp diễn ra", tone: "info" },
  ended: { label: "Đã kết thúc", tone: "neutral" },
};

const SHOP_STATUS_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Hoạt động", tone: "success" },
  suspended: { label: "Đang đình chỉ", tone: "danger" },
  pending: { label: "Chờ duyệt", tone: "warning" },
};

const BUSINESS_TYPE_LABEL: Record<string, string> = {
  personal: "Cá nhân",
  household: "Hộ kinh doanh",
  company: "Doanh nghiệp",
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

/** Chi tiết một khuyến mãi — đủ thông tin sản phẩm + gian hàng để admin xét đoán nhanh. */
export default function PromotionDetailModal({
  productId,
  onClose,
  onEnded,
}: {
  productId: string;
  onClose: () => void;
  onEnded: (productId: string) => void;
}) {
  const [data, setData] = useState<AdminPromotionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPromotionDetail(productId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Không tải được chi tiết.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  async function confirmEnd() {
    setBusy(true);
    setError("");
    try {
      await endPromotion(productId);
      onEnded(productId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xử lý được.");
      setBusy(false);
    }
  }

  const p = data?.product;
  const shop = data?.shop;
  const deal = data?.deal;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(4,10,18,0.97)] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-6 py-4">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-star">{p?.name ?? "Đang tải…"}</p>
            {shop && <p className="mt-0.5 truncate text-[12.5px] text-star/50">Gian hàng &ldquo;{shop.name}&rdquo;</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {data && <Badge tone={STATE_BADGE[data.state].tone}>{STATE_BADGE[data.state].label}</Badge>}
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
          {loading ? (
            <div className="flex justify-center py-10">
              <CircleNotch size={22} className="animate-spin text-star/40" />
            </div>
          ) : loadError ? (
            <p className="text-[13.5px] text-rose-300">{loadError}</p>
          ) : p && shop && deal ? (
            <>
              {p.images.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {p.images.slice(0, 6).map((url, i) => (
                    <a
                      key={url + i}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              )}

              {deal.flagged && (
                <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] leading-relaxed text-star/80">
                  <Warning size={16} weight="fill" className="mt-0.5 shrink-0 text-amber-400" />
                  <span>{deal.flagReason ?? "Nghi ngờ giá gốc bị đẩy lên trước khi đặt khuyến mãi."}</span>
                </p>
              )}

              {/* Sản phẩm */}
              <div className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
                <p className="mb-2.5 text-[12.5px] font-semibold text-star/70">Sản phẩm</p>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13.5px]">
                  <span className="text-star/80">
                    <span className="text-star/40 line-through">{formatVnd(p.priceMin)}</span>
                    {" → "}
                    <span className="font-semibold text-star">{formatVnd(deal.price)}</span>
                  </span>
                  <span className="font-semibold text-emerald-400">-{deal.discountPercent}%</span>
                </div>
                <p className="mt-1 text-[12px] text-star/45">
                  {fmtDate(deal.startsAt)} — {fmtDate(deal.endsAt)}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <Stat icon={ShoppingBag} label="Đã bán" value={p.stats.sold.toLocaleString("vi-VN")} />
                  <Stat icon={Package} label="Tồn kho" value={p.totalStock.toLocaleString("vi-VN")} />
                  <Stat icon={Eye} label="Lượt xem" value={p.stats.views.toLocaleString("vi-VN")} />
                  <Stat icon={Heart} label="Yêu thích" value={p.stats.favorites.toLocaleString("vi-VN")} />
                </div>
                <div className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-star/60">
                  <Star size={13} weight="fill" className="text-amber-400" />
                  {p.stats.ratingAvg.toFixed(1)} ({p.stats.ratingCount.toLocaleString("vi-VN")} đánh giá)
                  <span className="mx-1 text-star/25">·</span>
                  <Badge tone={p.status === "active" ? "success" : "neutral"}>
                    {p.status === "active" ? "Đang bán" : p.status === "draft" ? "Nháp" : "Đã ẩn"}
                  </Badge>
                  {p.moderationState && p.moderationState !== "ok" && (
                    <Badge tone="warning">{p.moderationState === "pending" ? "Chờ duyệt" : "Bị từ chối"}</Badge>
                  )}
                </div>
              </div>

              {/* Gian hàng */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                  <p className="text-[12.5px] font-semibold text-star/70">Gian hàng</p>
                  <Badge tone={SHOP_STATUS_BADGE[shop.status]?.tone ?? "neutral"}>
                    {SHOP_STATUS_BADGE[shop.status]?.label ?? shop.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.05] text-star/30">
                    {shop.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={shop.logoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ShoppingBag size={16} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-star/85">{shop.name}</p>
                    <p className="text-[12px] text-star/45">
                      {BUSINESS_TYPE_LABEL[shop.businessType] ?? shop.businessType}
                    </p>
                  </div>
                </div>
                {shop.status === "suspended" && (
                  <p className="mt-2 text-[12px] text-rose-300">
                    Đang bị đình chỉ{shop.suspendedUntil ? ` đến ${fmtDate(shop.suspendedUntil)}` : " vô thời hạn"}.
                  </p>
                )}
                <p className="mt-2.5 text-[12.5px] text-star/55">
                  Liên hệ: {shop.contactName} · {shop.contactPhone}
                  {shop.contactEmail ? ` · ${shop.contactEmail}` : ""}
                </p>
                {shop.description && (
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-star/45">{shop.description}</p>
                )}
              </div>

              {error && (
                <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[13px] text-rose-200">
                  {error}
                </p>
              )}
            </>
          ) : null}
        </div>

        {!loading && !loadError && data && data.state !== "ended" && (
          <div className="flex justify-end gap-3 border-t border-white/[0.07] px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[13.5px] font-medium text-star/70 transition-colors hover:border-white/20 hover:text-star"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 text-[13.5px] font-semibold text-rose-300 transition-colors hover:border-rose-500/50"
            >
              <XCircle size={15} weight="bold" />
              Kết thúc khuyến mãi
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Kết thúc khuyến mãi này?"
        description={
          deal?.flagged
            ? "Khuyến mãi này đang bị nghi ngờ giá ảo. Kết thúc sẽ gỡ khuyến mãi khỏi trang sản phẩm ngay lập tức và báo cho gian hàng."
            : "Khuyến mãi sẽ bị gỡ khỏi trang sản phẩm ngay lập tức và gian hàng sẽ nhận được thông báo."
        }
        confirmLabel="Kết thúc"
        tone="danger"
        icon={XCircle}
        busy={busy}
        onConfirm={() => void confirmEnd()}
        onClose={() => !busy && setConfirming(false)}
      />
    </div>
  );
}

function Stat({ icon: IconCmp, label, value }: { icon: typeof Eye; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
      <span className="flex items-center gap-1 text-[11px] text-star/40">
        <IconCmp size={11} />
        {label}
      </span>
      <span className="mt-0.5 block text-[13px] font-medium text-star/85">{value}</span>
    </div>
  );
}
