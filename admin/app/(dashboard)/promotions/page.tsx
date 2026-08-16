"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleNotch, Eye, Package, Warning, XCircle } from "@phosphor-icons/react";
import {
  Badge,
  DataTable,
  Panel,
  PageHeader,
  TabBar,
  Td,
  formatVnd,
  type BadgeTone,
} from "../../../components/dashboard/ui";
import ConfirmDialog from "../../../components/dashboard/ConfirmDialog";
import PromotionDetailModal from "../../../components/dashboard/PromotionDetailModal";
import {
  endPromotion,
  getPromotions,
  type AdminPromotionItem,
  type AdminPromotionListResult,
  type PromotionTab,
} from "../../../lib/promotions-api";

const STATE_BADGE: Record<AdminPromotionItem["state"], { label: string; tone: BadgeTone }> = {
  live: { label: "Đang chạy", tone: "success" },
  scheduled: { label: "Sắp diễn ra", tone: "info" },
  ended: { label: "Đã kết thúc", tone: "neutral" },
};

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

/** Nút icon-only tự đủ class — GhostButton icon-only bị base `px-4` đè mất icon (xem categories/reviews). */
function IconActionButton({
  icon: IconCmp,
  label,
  tone = "default",
  onClick,
}: {
  icon: typeof Eye;
  label: string;
  tone?: "default" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-star/70 transition-colors active:scale-[0.98] ${
        tone === "danger" ? "hover:border-rose-500/40 hover:text-rose-300" : "hover:border-white/20 hover:text-star"
      }`}
    >
      <IconCmp size={15} weight="regular" />
    </button>
  );
}

export default function PromotionsPage() {
  const [tab, setTab] = useState<PromotionTab>("all");
  const [data, setData] = useState<AdminPromotionListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [detailId, setDetailId] = useState<string | null>(null);
  const [endTarget, setEndTarget] = useState<AdminPromotionItem | null>(null);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getPromotions(tab));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh sách.");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const c = data?.counts;
  const tabs: { key: PromotionTab; label: string; count?: number }[] = [
    { key: "all", label: "Tất cả", count: c?.all },
    { key: "live", label: "Đang chạy", count: c?.live },
    { key: "scheduled", label: "Sắp diễn ra", count: c?.scheduled },
    { key: "flagged", label: "Nghi ngờ giá ảo", count: c?.flagged },
  ];

  function removeLocal(productId: string) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.filter((it) => it.productId !== productId),
            counts: {
              ...prev.counts,
              all: Math.max(0, prev.counts.all - 1),
            },
          }
        : prev,
    );
  }

  async function confirmEndFromRow() {
    if (!endTarget) return;
    setEnding(true);
    setEndError("");
    try {
      await endPromotion(endTarget.productId);
      removeLocal(endTarget.productId);
      setEndTarget(null);
    } catch (e) {
      setEndError(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      setEnding(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Khuyến mãi"
        description="Khuyến mãi flash sale của mọi gian hàng trên sàn — hệ thống tự đánh dấu khi giá gốc vừa bị đẩy lên ngay trước khi đặt sale."
      />

      {error && (
        <p className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-200">
          {error}
        </p>
      )}

      <Panel padded={false} className="overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <TabBar tabs={tabs} value={tab} onChange={(k) => setTab(k as PromotionTab)} />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <CircleNotch size={22} className="animate-spin text-star/40" />
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-star/40">
            <Package size={28} />
            <p className="text-[13.5px]">Không có khuyến mãi nào ở mục này.</p>
          </div>
        ) : (
          <DataTable columns={["Sản phẩm", "Gian hàng", "Giá gốc → Sale", "Giảm", "Trạng thái", "Thời gian", ""]}>
            {(data?.items ?? []).map((p) => (
              <tr key={p.productId}>
                <Td className="max-w-[200px] font-medium text-star/85">
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.05] text-star/30">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Package size={16} />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{p.name}</span>
                      {p.flagged && (
                        <span
                          className="mt-0.5 flex items-center gap-1 text-[11.5px] font-normal text-amber-400"
                          title={p.flagReason}
                        >
                          <Warning size={11} weight="fill" />
                          Nghi ngờ giá ảo
                        </span>
                      )}
                    </span>
                  </span>
                </Td>
                <Td className="text-star/60">{p.shop.name}</Td>
                <Td className="text-star/85">
                  <span className="text-star/40 line-through">{formatVnd(p.priceMin)}</span>
                  {" → "}
                  {formatVnd(p.deal?.price ?? 0)}
                </Td>
                <Td className="text-emerald-400">-{p.deal?.discountPercent ?? 0}%</Td>
                <Td>
                  <Badge tone={STATE_BADGE[p.state].tone}>{STATE_BADGE[p.state].label}</Badge>
                </Td>
                <Td className="text-star/45">
                  {p.deal?.startsAt ? `${fmtDate(p.deal.startsAt)} — ` : ""}
                  {fmtDate(p.deal?.endsAt)}
                </Td>
                <Td>
                  <span className="flex gap-1.5">
                    <IconActionButton icon={Eye} label="Xem chi tiết" onClick={() => setDetailId(p.productId)} />
                    <IconActionButton
                      icon={XCircle}
                      label="Kết thúc khuyến mãi"
                      tone="danger"
                      onClick={() => {
                        setEndError("");
                        setEndTarget(p);
                      }}
                    />
                  </span>
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>

      {data?.items.some((p) => p.flagged) && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-[12.5px] leading-relaxed text-star/60">
          <Warning size={15} weight="fill" className="mt-0.5 shrink-0 text-amber-400" />
          &ldquo;Nghi ngờ giá ảo&rdquo; nghĩa là giá gốc đang dùng để tính % giảm vừa mới bị tăng lên trong vòng 48
          giờ trước khi đặt khuyến mãi. Đây chỉ là cảnh báo tự động — không tự chặn khuyến mãi, admin xem chi tiết
          và tự quyết định kết thúc hay bỏ qua.
        </p>
      )}

      {detailId && (
        <PromotionDetailModal
          productId={detailId}
          onClose={() => setDetailId(null)}
          onEnded={(productId) => removeLocal(productId)}
        />
      )}

      <ConfirmDialog
        open={!!endTarget}
        title="Kết thúc khuyến mãi này?"
        description={
          <>
            {endTarget && (
              <>
                Khuyến mãi cho sản phẩm <strong className="text-star/80">&ldquo;{endTarget.name}&rdquo;</strong> sẽ
                bị gỡ khỏi trang sản phẩm ngay lập tức và gian hàng sẽ nhận được thông báo.
                {endTarget.flagged && " Khuyến mãi này đang bị nghi ngờ giá ảo."}
              </>
            )}
            {endError && <p className="mt-2 text-rose-300">{endError}</p>}
          </>
        }
        confirmLabel="Kết thúc"
        tone="danger"
        icon={XCircle}
        busy={ending}
        onConfirm={() => void confirmEndFromRow()}
        onClose={() => {
          if (!ending) {
            setEndTarget(null);
            setEndError("");
          }
        }}
      />
    </div>
  );
}
