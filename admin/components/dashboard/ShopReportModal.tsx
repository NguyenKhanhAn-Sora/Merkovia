"use client";

import { useEffect, useState } from "react";
import {
  CircleNotch,
  LockKeyOpen,
  PlayCircle,
  Prohibit,
  ShieldWarning,
  Storefront,
  X,
  XCircle,
} from "@phosphor-icons/react";
import {
  getShopReports,
  resolveShopReports,
  unsuspendShop,
  REPORT_REASON_LABEL,
  REPORTER_TRUST_LABEL,
  type ReportAction,
  type ReporterTrustTier,
  type ShopProfile,
  type ShopReportsDetail,
} from "../../lib/shop-reports-api";
import { Badge, formatVnd, type BadgeTone } from "./ui";

/** Định dạng % gọn, vd 0.156 -> "16%". */
function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** Tông màu cảnh báo cho một chỉ số — cao bất thường thì tô nổi lên thay vì lẫn vào chữ trung tính. */
function toneClass(level: "normal" | "warn" | "danger"): string {
  if (level === "danger") return "text-rose-300";
  if (level === "warn") return "text-amber-300";
  return "text-star/85";
}

/** Hàm thuần bên ngoài component — gọi `Date.now()` trong thân component sẽ bị lint chặn (impure render). */
function ageInDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
}

/**
 * Hồ sơ vận hành của shop — cơ sở để admin xác nhận vi phạm ngoài lời tố cáo.
 * Ngưỡng cảnh báo (15% huỷ/trả hàng, dưới 4 sao) là ước lượng hợp lý cho sàn
 * quy mô hiện tại — có thể tinh chỉnh sau khi có dữ liệu thực tế.
 */
function ShopProfilePanel({ profile }: { profile: ShopProfile }) {
  const cancelLevel = profile.sellerCancelRate > 0.25 ? "danger" : profile.sellerCancelRate > 0.15 ? "warn" : "normal";
  const returnLevel = profile.returnRate > 0.25 ? "danger" : profile.returnRate > 0.15 ? "warn" : "normal";
  const ratingLevel =
    profile.ratingCount === 0 ? "normal" : profile.ratingAvg < 3.5 ? "danger" : profile.ratingAvg < 4 ? "warn" : "normal";
  const suspendLevel = profile.pastSuspensions > 0 ? "danger" : profile.pastWarnings > 0 ? "warn" : "normal";
  const rejectedLevel = profile.rejectedProductCount > 0 ? "warn" : "normal";
  const ageDays = ageInDays(profile.createdAt);

  const BUSINESS_LABEL: Record<string, string> = {
    personal: "Cá nhân",
    household: "Hộ kinh doanh",
    company: "Doanh nghiệp",
  };

  const cells: { label: string; value: string; level: "normal" | "warn" | "danger" }[] = [
    {
      label: "Tuổi gian hàng",
      value: ageDays < 30 ? `${ageDays} ngày` : `${Math.floor(ageDays / 30)} tháng`,
      level: ageDays < 14 ? "warn" : "normal",
    },
    {
      label: "Loại hình",
      value:
        (BUSINESS_LABEL[profile.businessType] ?? profile.businessType) +
        (profile.hasTaxCode ? " · có MST" : " · chưa có MST"),
      level: "normal",
    },
    { label: "Tổng đơn hàng", value: String(profile.totalOrders), level: "normal" },
    { label: "Tỉ lệ shop tự huỷ đơn", value: pct(profile.sellerCancelRate), level: cancelLevel },
    { label: "Tỉ lệ bị trả hàng", value: pct(profile.returnRate), level: returnLevel },
    {
      label: "Đánh giá",
      value: profile.ratingCount > 0 ? `${profile.ratingAvg}★ (${profile.ratingCount})` : "Chưa có đánh giá",
      level: ratingLevel,
    },
    {
      label: "Tiền án vi phạm",
      value: `${profile.pastWarnings} cảnh cáo · ${profile.pastSuspensions} đình chỉ`,
      level: suspendLevel,
    },
    {
      label: "Sản phẩm",
      value: `${profile.activeProductCount} đang bán · ${profile.rejectedProductCount} từng bị từ chối`,
      level: rejectedLevel,
    },
  ];

  return (
    <div className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
      <p className="mb-2.5 text-[12.5px] font-semibold text-star/70">Hồ sơ gian hàng</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label}>
            <p className="text-[11px] text-star/40">{c.label}</p>
            <p className={`mt-0.5 text-[13px] font-medium ${toneClass(c.level)}`}>{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Số ngày đình chỉ có sẵn để chọn nhanh — `undefined` = vô thời hạn. */
const SUSPEND_DURATION_OPTIONS: { value: number | undefined; label: string }[] = [
  { value: 7, label: "7 ngày" },
  { value: 14, label: "14 ngày" },
  { value: 30, label: "30 ngày" },
  { value: 90, label: "90 ngày" },
  { value: undefined, label: "Vô thời hạn" },
];

const STATUS_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Đang chờ", tone: "warning" },
  resolved: { label: "Đã xử lý", tone: "neutral" },
  dismissed: { label: "Đã bỏ qua", tone: "neutral" },
};

/** Chỉ hiện huy hiệu ở hai đầu (cần thận trọng / uy tín) — `regular` là đa số, hiện ra chỉ gây rối mắt. */
const TRUST_BADGE: Partial<Record<ReporterTrustTier, BadgeTone>> = {
  low: "danger",
  trusted: "success",
};

const ACTION_OPTIONS: {
  value: ReportAction;
  label: string;
  hint: string;
  icon: typeof ShieldWarning;
}[] = [
  {
    value: "warning",
    label: "Cảnh cáo",
    hint: "Gian hàng vẫn hoạt động, chỉ gửi cảnh báo vi phạm.",
    icon: ShieldWarning,
  },
  {
    value: "suspend",
    label: "Tạm đình chỉ",
    hint: "Khoá gian hàng ngay — không thể đăng bán/nhận thanh toán.",
    icon: Prohibit,
  },
  {
    value: "dismiss",
    label: "Bỏ qua",
    hint: "Xác định không có vi phạm — đóng báo cáo, không thông báo cho shop.",
    icon: XCircle,
  },
];

/** Chi tiết + xử lý TẤT CẢ báo cáo đang chờ của một gian hàng, trong một hộp thoại. */
export default function ShopReportModal({
  shopId,
  onClose,
  onResolved,
}: {
  shopId: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [detail, setDetail] = useState<ShopReportsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [action, setAction] = useState<ReportAction | null>(null);
  const [note, setNote] = useState("");
  const [suspendDays, setSuspendDays] = useState<number | undefined>(7);
  const [durationTouched, setDurationTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [unsuspending, setUnsuspending] = useState(false);
  const [unsuspendError, setUnsuspendError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getShopReports(shopId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Không tải được báo cáo.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const pendingCount = detail?.reports.filter((r) => r.status === "pending").length ?? 0;

  async function submit() {
    if (!action) return;
    if (action !== "dismiss" && note.trim().length < 10) {
      setError("Vui lòng ghi rõ lý do (ít nhất 10 ký tự) để thông báo cho gian hàng.");
      return;
    }
    if (action === "suspend" && !durationTouched) {
      setError("Vui lòng chọn thời hạn đình chỉ.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await resolveShopReports(shopId, {
        action,
        note: note.trim() || undefined,
        suspendDays: action === "suspend" ? suspendDays : undefined,
      });
      onResolved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xử lý được báo cáo.");
    } finally {
      setBusy(false);
    }
  }

  async function doUnsuspend() {
    setUnsuspending(true);
    setUnsuspendError("");
    try {
      await unsuspendShop(shopId);
      onResolved();
      onClose();
    } catch (e) {
      setUnsuspendError(e instanceof Error ? e.message : "Không gỡ được đình chỉ.");
    } finally {
      setUnsuspending(false);
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
        className="relative flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(4,10,18,0.97)] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-6 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Storefront size={18} className="shrink-0 text-cosmic-violet" />
            <span className="truncate text-[15px] font-semibold text-star">
              {detail?.shop.name ?? "Đang tải…"}
            </span>
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

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <CircleNotch size={22} className="animate-spin text-star/40" />
            </div>
          ) : loadError ? (
            <p className="text-[13.5px] text-rose-300">{loadError}</p>
          ) : (
            <>
              {detail?.shopProfile && <ShopProfilePanel profile={detail.shopProfile} />}

              {detail?.shop.status === "suspended" && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-rose-200">
                      Gian hàng đang bị đình chỉ
                    </p>
                    <p className="mt-0.5 text-[12px] text-star/50">
                      {detail.shop.suspendedUntil
                        ? `Tự động gỡ vào ${new Date(detail.shop.suspendedUntil).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" })}`
                        : "Đình chỉ vô thời hạn — chỉ gỡ được bằng tay."}
                    </p>
                    {unsuspendError && (
                      <p className="mt-1 text-[12px] text-rose-300">{unsuspendError}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void doUnsuspend()}
                    disabled={unsuspending}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 text-[12.5px] font-medium text-star/80 transition-colors hover:border-white/25 hover:text-star disabled:opacity-50"
                  >
                    {unsuspending ? (
                      <CircleNotch size={14} className="animate-spin" />
                    ) : (
                      <LockKeyOpen size={14} weight="bold" />
                    )}
                    Gỡ đình chỉ ngay
                  </button>
                </div>
              )}

              <ul className="space-y-3">
                {detail?.reports.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[13.5px] font-medium text-star/85">
                        {REPORT_REASON_LABEL[r.reasonType] ?? r.reasonType}
                      </span>
                      <Badge tone={STATUS_LABEL[r.status]?.tone ?? "neutral"}>
                        {STATUS_LABEL[r.status]?.label ?? r.status}
                      </Badge>
                    </div>
                    {r.detail && (
                      <p className="mt-1.5 text-[13px] leading-relaxed text-star/60">
                        {r.detail}
                      </p>
                    )}

                    {r.evidence.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {r.evidence.map((ev, i) => (
                          <a
                            key={ev.url + i}
                            href={ev.url}
                            target="_blank"
                            rel="noreferrer"
                            className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]"
                            title={ev.kind === "video" ? "Xem video minh chứng" : "Xem ảnh minh chứng cỡ đầy đủ"}
                          >
                            {ev.kind === "video" ? (
                              <span className="flex h-full w-full items-center justify-center text-star/60">
                                <PlayCircle size={20} weight="fill" />
                              </span>
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={ev.url} alt="" className="h-full w-full object-cover" />
                            )}
                          </a>
                        ))}
                      </div>
                    )}

                    {r.order && (
                      <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] text-star/55">
                        <p className="font-medium text-star/70">
                          Đơn {r.order.orderCode} · {formatVnd(r.order.total)}
                        </p>
                        <p className="mt-0.5 truncate">
                          {r.order.items
                            .map((it) => `${it.name}${it.variantLabel ? ` (${it.variantLabel})` : ""} ×${it.quantity}`)
                            .join(", ")}
                        </p>
                      </div>
                    )}

                    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-star/40">
                      <span>
                        Người báo cáo: {r.reporterContact} ·{" "}
                        {new Date(r.createdAt).toLocaleString("vi-VN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                      {TRUST_BADGE[r.reporterTrust] && (
                        <Badge tone={TRUST_BADGE[r.reporterTrust]}>
                          {REPORTER_TRUST_LABEL[r.reporterTrust]}
                        </Badge>
                      )}
                    </p>
                  </li>
                ))}
              </ul>

              {pendingCount === 0 ? (
                <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] text-star/50">
                  Không còn báo cáo nào đang chờ xử lý cho gian hàng này.
                </p>
              ) : (
                <div className="mt-5">
                  <p className="mb-2.5 text-[13px] font-medium text-star/70">
                    Xử lý {pendingCount} báo cáo đang chờ
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {ACTION_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const selected = action === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setAction(opt.value);
                            setError("");
                            if (opt.value !== "suspend") setDurationTouched(false);
                          }}
                          className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                            selected
                              ? "border-cosmic-violet/50 bg-cosmic-violet/10"
                              : "border-white/10 bg-white/[0.03] hover:border-white/20"
                          }`}
                        >
                          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-star">
                            <Icon size={15} weight="fill" />
                            {opt.label}
                          </span>
                          <span className="mt-1 block text-[11.5px] leading-snug text-star/45">
                            {opt.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {action === "suspend" && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-[12px] font-medium text-star/60">
                        Thời hạn đình chỉ
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {SUSPEND_DURATION_OPTIONS.map((opt) => {
                          const selected =
                            durationTouched && suspendDays === opt.value;
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
                    </div>
                  )}

                  {action && action !== "dismiss" && (
                    <textarea
                      value={note}
                      onChange={(e) => {
                        setNote(e.target.value);
                        setError("");
                      }}
                      placeholder="Ghi rõ lý do — nội dung này sẽ gửi thẳng cho gian hàng…"
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
                </div>
              )}
            </>
          )}
        </div>

        {pendingCount > 0 && !loading && !loadError && (
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
              disabled={busy || !action}
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
