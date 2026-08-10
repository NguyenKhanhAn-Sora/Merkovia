"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle,
  CircleNotch,
  MagnifyingGlass,
  Receipt,
  Warning,
  X,
  XCircle,
} from "@phosphor-icons/react";
import {
  checkPayoutStatus,
  getPayoutDetail,
  resolvePayout,
  type AdminPayoutDetail,
  type PayoutStatus,
} from "../../lib/payouts-api";
import { Badge, formatVnd, type BadgeTone } from "./ui";

const STATUS_BADGE: Record<PayoutStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Chờ gửi lệnh", tone: "neutral" },
  processing: { label: "Đang xử lý", tone: "warning" },
  paid: { label: "Đã chuyển", tone: "success" },
  failed: { label: "Thất bại", tone: "danger" },
};

function formatDateTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Chi tiết một đợt chi + đối soát đợt đang kẹt ở `processing`.
 *
 * Hai đường gỡ kẹt, KHÔNG ngang hàng: "Tra cứu nhà cung cấp" là đường AN TOÀN
 * (dựa trên sự thật phía nhà cung cấp) nên luôn thử trước; "Chốt thủ công" là
 * phương án cuối khi không tra được, bắt buộc ghi lý do vì admin đang quyết
 * định THAY cho phản hồi thật — cố tình tách UI rõ ràng để không ai bấm nhầm.
 */
export default function PayoutDetailModal({
  payoutId,
  onClose,
  onResolved,
}: {
  payoutId: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [detail, setDetail] = useState<AdminPayoutDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");

  const [showForceForm, setShowForceForm] = useState(false);
  const [forceAction, setForceAction] = useState<"paid" | "failed" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    setLoadError("");
    getPayoutDetail(payoutId)
      .then((d) => setDetail(d))
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : "Không tải được đợt chi.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payoutId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function doCheckStatus() {
    setChecking(true);
    setCheckMsg("");
    setError("");
    try {
      const r = await checkPayoutStatus(payoutId);
      if (r.changed) {
        onResolved();
        load();
      } else {
        setCheckMsg("Nhà cung cấp vẫn báo đang xử lý — thử lại sau.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tra cứu được.");
    } finally {
      setChecking(false);
    }
  }

  async function submitForceResolve() {
    if (!forceAction) return;
    if (note.trim().length < 5) {
      setError("Vui lòng ghi rõ căn cứ xác nhận (ít nhất 5 ký tự).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await resolvePayout(payoutId, forceAction, note.trim());
      onResolved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      setBusy(false);
    }
  }

  const p = detail?.payout;
  const badge = p ? STATUS_BADGE[p.status] : undefined;

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
            <p className="truncate text-[15px] font-semibold text-star">{p?.code ?? "Đang tải…"}</p>
            {p && (
              <p className="mt-0.5 truncate text-[12.5px] text-star/50">
                {p.shop.name} · {formatDateTime(p.createdAt)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
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
          ) : p ? (
            <>
              <div className="mb-4 space-y-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 text-[13px]">
                <div className="flex justify-between text-star/55">
                  <span>Tiền hàng gộp ({p.orderCount} đơn)</span>
                  <span>{formatVnd(p.grossAmount)}</span>
                </div>
                <div className="flex justify-between text-star/55">
                  <span>Hoa hồng sàn ({(p.commissionRate * 100).toFixed(0)}%)</span>
                  <span>-{formatVnd(p.commissionAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-white/[0.07] pt-1.5 font-semibold text-star/90">
                  <span>Thực chi</span>
                  <span>{formatVnd(p.netAmount)}</span>
                </div>
              </div>

              <div className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 text-[13px]">
                <p className="mb-1.5 text-star/45">Tài khoản nhận tiền</p>
                <p className="text-star/85">
                  {p.accountHolderName} · {p.accountNumber}
                </p>
                <p className="mt-0.5 text-star/55">{p.bankName}</p>
                <p className="mt-2 text-star/40">
                  Nhà cung cấp: {p.provider}
                  {p.providerRef ? ` · Mã lệnh: ${p.providerRef}` : " · Chưa có mã lệnh"}
                </p>
              </div>

              {p.status === "paid" && (
                <p className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-[13px] leading-relaxed text-star/80">
                  <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-emerald-400" />
                  <span>Đã chuyển thành công lúc {formatDateTime(p.paidAt)}.</span>
                </p>
              )}

              {p.status === "failed" && (
                <p className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-[13px] leading-relaxed text-star/80">
                  <XCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-rose-400" />
                  <span>
                    {p.failureReason ?? "Chuyển tiền thất bại."} Đơn hàng đã được nhả lại — người bán có
                    thể yêu cầu rút lần nữa.
                  </span>
                </p>
              )}

              {(p.adminResolutionNote || p.resolvedByAdminEmail) && (
                <p className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[12.5px] leading-relaxed text-star/55">
                  Chốt thủ công bởi {p.resolvedByAdminEmail ?? "admin"}
                  {p.adminResolutionNote ? `: ${p.adminResolutionNote}` : ""}
                </p>
              )}

              {p.status === "processing" && (
                <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3.5 text-[13px] text-star/80">
                  <p className="flex items-start gap-2 leading-relaxed">
                    <Warning size={16} weight="fill" className="mt-0.5 shrink-0 text-amber-400" />
                    Đợt chi đang kẹt ở &ldquo;đang xử lý&rdquo; — nhà cung cấp chưa trả kết quả cuối cùng
                    (thành công hay thất bại). Ưu tiên tra cứu lại trước khi chốt thủ công.
                  </p>

                  <button
                    type="button"
                    onClick={() => void doCheckStatus()}
                    disabled={checking || !p.providerRef}
                    className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 text-[13px] font-medium text-amber-200 transition-colors hover:border-amber-500/50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {checking ? (
                      <CircleNotch size={14} className="animate-spin" />
                    ) : (
                      <MagnifyingGlass size={14} weight="bold" />
                    )}
                    {checking ? "Đang tra cứu…" : "Tra cứu nhà cung cấp"}
                  </button>
                  {!p.providerRef && (
                    <p className="mt-1.5 text-[12px] text-star/45">
                      Chưa có mã lệnh nên không tra cứu được — chỉ còn cách chốt thủ công bên dưới.
                    </p>
                  )}
                  {checkMsg && <p className="mt-1.5 text-[12px] text-star/55">{checkMsg}</p>}

                  {!showForceForm ? (
                    <button
                      type="button"
                      onClick={() => setShowForceForm(true)}
                      className="mt-2 block text-[12.5px] text-star/45 underline decoration-dotted underline-offset-2 hover:text-star/70"
                    >
                      Không tra được / vẫn kẹt lâu? Chốt thủ công
                    </button>
                  ) : (
                    <div className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/5 p-3">
                      <p className="mb-2 text-[12.5px] font-medium text-rose-200">
                        Chốt thủ công — chỉ dùng khi đã xác minh thật (vd sao kê ngân hàng)
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setForceAction("paid");
                            setError("");
                          }}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                            forceAction === "paid"
                              ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                              : "border-white/10 bg-white/[0.03] text-star/70 hover:border-white/20"
                          }`}
                        >
                          <CheckCircle size={14} weight="fill" />
                          Đã chuyển thành công
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setForceAction("failed");
                            setError("");
                          }}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                            forceAction === "failed"
                              ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
                              : "border-white/10 bg-white/[0.03] text-star/70 hover:border-white/20"
                          }`}
                        >
                          <XCircle size={14} weight="fill" />
                          Thất bại
                        </button>
                      </div>
                      {forceAction && (
                        <textarea
                          value={note}
                          onChange={(e) => {
                            setNote(e.target.value);
                            setError("");
                          }}
                          placeholder="Bắt buộc: căn cứ xác nhận, vd mã giao dịch trên sao kê ngân hàng…"
                          rows={2}
                          maxLength={500}
                          className="mt-2.5 w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] leading-relaxed text-star placeholder:text-star/30 outline-none transition-colors focus:border-rose-400/50"
                        />
                      )}
                      {forceAction && (
                        <button
                          type="button"
                          onClick={() => void submitForceResolve()}
                          disabled={busy}
                          className="mt-2.5 inline-flex h-9 items-center gap-2 rounded-lg bg-rose-500/90 px-3.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {busy && <CircleNotch size={14} className="animate-spin" />}
                          {busy ? "Đang xử lý…" : "Xác nhận chốt thủ công"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {error && (
                <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[13px] text-rose-200">
                  {error}
                </p>
              )}

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-star/70">
                  <Receipt size={14} />
                  Đơn hàng trong đợt chi ({detail.orders.length})
                </p>
                <ul className="space-y-1.5">
                  {detail.orders.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12.5px]"
                    >
                      <span className="text-star/80">{o.orderCode}</span>
                      <span className="text-star/45">{formatDateTime(o.deliveredAt)}</span>
                      <span className="font-medium text-star/85">{formatVnd(o.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-white/[0.07] px-6 py-4">
          <button
            type="button"
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[13.5px] font-medium text-star/70 transition-colors hover:border-white/20 hover:text-star disabled:opacity-45"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
