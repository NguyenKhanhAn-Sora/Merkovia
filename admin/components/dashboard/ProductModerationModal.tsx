"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle,
  CircleNotch,
  Clock,
  PlayCircle,
  Robot,
  ShieldCheck,
  UserGear,
  Warning,
  X,
  XCircle,
} from "@phosphor-icons/react";
import {
  getProductDetail,
  moderateProduct,
  type AdminProductDetail,
  type ModerationLogItem,
} from "../../lib/products-api";
import { Badge, formatVnd, type BadgeTone } from "./ui";

const MODERATION_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  ok: { label: "Đã duyệt", tone: "success" },
  pending: { label: "Chờ duyệt", tone: "warning" },
  rejected: { label: "Bị từ chối", tone: "danger" },
};

const VERDICT_LABEL: Record<ModerationLogItem["verdict"], { label: string; tone: BadgeTone; icon: typeof CheckCircle }> = {
  approve: { label: "Duyệt", tone: "success", icon: CheckCircle },
  reject: { label: "Từ chối", tone: "danger", icon: XCircle },
  error: { label: "Lỗi hệ thống", tone: "neutral", icon: Warning },
};

function priceLabel(v: AdminProductDetail["variants"]) {
  if (!v.length) return "—";
  const prices = v.map((x) => x.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatVnd(min) : `${formatVnd(min)} – ${formatVnd(max)}`;
}

/** Chi tiết một sản phẩm + lịch sử kiểm duyệt, cho admin duyệt/từ chối tay bất cứ lúc nào. */
export default function ProductModerationModal({
  productId,
  onClose,
  onResolved,
}: {
  productId: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [product, setProduct] = useState<AdminProductDetail | null>(null);
  const [logs, setLogs] = useState<ModerationLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProductDetail(productId)
      .then((d) => {
        if (!cancelled) {
          setProduct(d.product);
          setLogs(d.logs);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Không tải được sản phẩm.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit() {
    if (!decision) return;
    if (decision === "reject" && reason.trim().length < 5) {
      setError("Vui lòng nêu lý do từ chối (ít nhất 5 ký tự) — nội dung này gửi cho gian hàng.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await moderateProduct(productId, decision, reason.trim() || undefined);
      onResolved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      setBusy(false);
    }
  }

  const mod = product?.moderation;
  const modBadge = mod ? MODERATION_LABEL[mod.state] : undefined;

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
        className="relative flex max-h-[85vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(4,10,18,0.97)] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-6 py-4">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-star">
              {product?.name ?? "Đang tải…"}
            </p>
            {product?.shop && (
              <p className="mt-0.5 truncate text-[12.5px] text-star/50">
                Gian hàng &ldquo;{product.shop.name}&rdquo;
                {product.category?.name ? ` · ${product.category.name}` : ""}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {modBadge && <Badge tone={modBadge.tone}>{modBadge.label}</Badge>}
            <button
              type="button"
              onClick={() => !busy && onClose()}
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
          ) : product ? (
            <>
              {product.images.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {product.images.map((img, i) => (
                    <a
                      key={img.url + i}
                      href={img.url}
                      target="_blank"
                      rel="noreferrer"
                      className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]"
                      title="Xem ảnh cỡ đầy đủ"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt="" className="h-full w-full object-cover" />
                    </a>
                  ))}
                  {product.video && (
                    <a
                      href={product.video.url}
                      target="_blank"
                      rel="noreferrer"
                      className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] text-star/60"
                      title="Xem video sản phẩm"
                    >
                      <PlayCircle size={26} weight="fill" />
                    </a>
                  )}
                </div>
              )}

              <div className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 text-[13px]">
                <div className="flex flex-wrap justify-between gap-2 text-star/70">
                  <span>Giá: {priceLabel(product.variants)}</span>
                  <span className="text-star/50">
                    {product.variants.length} phân loại
                  </span>
                </div>
                {product.description && (
                  <p className="mt-2 leading-relaxed text-star/60">{product.description}</p>
                )}
                {product.attributes.length > 0 && (
                  <p className="mt-2 text-star/55">
                    {product.attributes.map((a) => `${a.name}: ${a.value}`).join(" · ")}
                  </p>
                )}
              </div>

              {mod?.state === "rejected" && mod.reason && (
                <p className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] leading-relaxed text-star/80">
                  <XCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-rose-400" />
                  <span>Lý do từ chối gần nhất: {mod.reason}</span>
                </p>
              )}

              {logs.length > 0 && (
                <div className="mb-5">
                  <p className="mb-2 text-[12.5px] font-semibold text-star/70">
                    Lịch sử kiểm duyệt
                  </p>
                  <ul className="space-y-2">
                    {logs.map((l) => {
                      const v = VERDICT_LABEL[l.verdict];
                      const Icon = v.icon;
                      return (
                        <li
                          key={l.id}
                          className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[12.5px]"
                        >
                          <Icon size={15} weight="fill" className="mt-0.5 shrink-0 text-star/45" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge tone={v.tone}>{v.label}</Badge>
                              <span className="inline-flex items-center gap-1 text-star/45">
                                {l.decidedBy === "ai" ? (
                                  <Robot size={12} weight="fill" />
                                ) : (
                                  <UserGear size={12} weight="fill" />
                                )}
                                {l.decidedBy === "ai" ? l.aiModel || "AI" : l.adminEmail || "Admin"}
                              </span>
                              <span className="text-star/35">
                                {new Date(l.createdAt).toLocaleString("vi-VN", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </span>
                            </div>
                            {l.reason && (
                              <p className="mt-1 leading-relaxed text-star/55">{l.reason}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {mod?.state === "pending" && logs.length === 0 && (
                <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] leading-relaxed text-star/75">
                  <Clock size={16} weight="fill" className="mt-0.5 shrink-0 text-amber-400" />
                  AI chưa xét xong — có thể đợi thêm hoặc duyệt/từ chối tay ngay.
                </p>
              )}

              <div className="mt-2">
                <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-star/70">
                  <ShieldCheck size={15} className="text-star/45" />
                  Quyết định của bạn (ghi đè AI nếu cần)
                </p>
                <div className="grid grid-cols-2 gap-2">
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
                    Duyệt
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
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      setError("");
                    }}
                    placeholder={
                      decision === "reject"
                        ? "Bắt buộc: lý do từ chối, gửi cho gian hàng…"
                        : "Ghi chú thêm (không bắt buộc)…"
                    }
                    rows={3}
                    maxLength={1000}
                    className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-[13.5px] leading-relaxed text-star placeholder:text-star/30 outline-none transition-colors focus:border-cosmic-violet/50"
                  />
                )}

                {error && (
                  <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[13px] text-rose-200">
                    {error}
                  </p>
                )}
              </div>
            </>
          ) : null}
        </div>

        {!loading && !loadError && product && (
          <div className="flex justify-end gap-3 border-t border-white/[0.07] px-6 py-4">
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
        )}
      </div>
    </div>
  );
}
