"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, MagnifyingGlass, Package, Star } from "@phosphor-icons/react";
import {
  Badge,
  DataTable,
  Panel,
  PageHeader,
  TabBar,
  Td,
  type BadgeTone,
} from "../../../components/dashboard/ui";
import ReviewModerationModal from "../../../components/dashboard/ReviewModerationModal";
import {
  getReviews,
  type AdminReviewItem,
  type AdminReviewListResult,
} from "../../../lib/reviews-api";

type HiddenTab = "all" | "hidden" | "visible";

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-400">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={13} weight={i < value ? "fill" : "regular"} className={i < value ? "" : "text-star/20"} />
      ))}
    </span>
  );
}

/** Nút icon-only tự đủ class — GhostButton icon-only bị base `px-4` đè mất icon (xem reviews cũ / categories). */
function IconActionButton({
  icon: IconCmp,
  label,
  onClick,
}: {
  icon: typeof Eye;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-star/70 transition-colors hover:border-white/20 hover:text-star active:scale-[0.98]"
    >
      <IconCmp size={15} weight="regular" />
    </button>
  );
}

export default function ReviewsPage() {
  const [tab, setTab] = useState<HiddenTab>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AdminReviewListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [openReview, setOpenReview] = useState<AdminReviewItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getReviews({ hidden: tab, q, page }));
    } finally {
      setLoading(false);
    }
  }, [tab, q, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const c = data?.counts;
  const tabs: { key: HiddenTab; label: string; count?: number }[] = [
    { key: "all", label: "Tất cả", count: c?.all },
    { key: "hidden", label: "Đã ẩn", count: c?.hidden },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  function applyChanged(updated: AdminReviewItem) {
    setOpenReview(updated);
    setData((prev) => {
      if (!prev) return prev;
      const before = prev.items.find((it) => it.id === updated.id);
      // "Đã ẩn" = review HOẶC reply đang bị ẩn — khớp đúng định nghĩa backend.
      const wasHidden = !!(before?.hidden || before?.replyHidden);
      const isHidden = updated.hidden || updated.replyHidden;

      // Gỡ ẩn xong mà đang xem tab "Đã ẩn" (hoặc ngược lại, vừa ẩn mà đang xem
      // tab "Hiển thị" — không có ở trang này nhưng cùng logic) thì hàng đó
      // phải biến mất khỏi danh sách NGAY, không đợi tải lại trang.
      const stillMatchesTab = tab === "all" ? true : tab === "hidden" ? isHidden : !isHidden;

      const items = stillMatchesTab
        ? prev.items.map((it) => (it.id === updated.id ? updated : it))
        : prev.items.filter((it) => it.id !== updated.id);

      return {
        ...prev,
        items,
        total: stillMatchesTab ? prev.total : Math.max(0, prev.total - 1),
        counts: {
          ...prev.counts,
          hidden: prev.counts.hidden + ((isHidden ? 1 : 0) - (wasHidden ? 1 : 0)),
        },
      };
    });
  }

  return (
    <div>
      <PageHeader title="Đánh giá" description="Kiểm duyệt đánh giá và phản hồi vi phạm chính sách nội dung." />

      <Panel padded={false} className="overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <TabBar
            tabs={tabs}
            value={tab}
            onChange={(k) => {
              setTab(k as HiddenTab);
              setPage(1);
            }}
          />
          <div className="relative mb-5 max-w-sm">
            <MagnifyingGlass
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-star/35"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo nội dung đánh giá…"
              aria-label="Tìm đánh giá"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-3 text-[13.5px] text-star outline-none transition-colors placeholder:text-star/35 focus:border-cosmic-violet/50"
            />
          </div>
        </div>

        {!loading && data && data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-star/40">
            <Package size={28} />
            <p className="text-[13.5px]">Không có đánh giá nào ở mục này.</p>
          </div>
        ) : (
          <DataTable columns={["Sản phẩm", "Người đánh giá", "Đánh giá", "Gian hàng", "Trạng thái", "Ngày", ""]}>
            {(data?.items ?? []).map((r: AdminReviewItem) => {
              const badgeTone: BadgeTone = r.hidden ? "danger" : r.replyHidden ? "warning" : "success";
              const badgeLabel = r.hidden ? "Đã ẩn" : r.replyHidden ? "Phản hồi bị ẩn" : "Hiển thị";
              return (
                <tr key={r.id}>
                  <Td className="max-w-[180px] truncate font-medium text-star/85">{r.product.name}</Td>
                  <Td className="text-star/60">{r.buyer.name}</Td>
                  <Td className="max-w-[260px]">
                    <Stars value={r.rating} />
                    {r.comment && <p className="mt-1 truncate text-[12.5px] text-star/45">{r.comment}</p>}
                  </Td>
                  <Td className="text-star/60">{r.shop.name}</Td>
                  <Td>
                    <Badge tone={badgeTone}>{badgeLabel}</Badge>
                  </Td>
                  <Td className="text-star/45">
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString("vi-VN") : "—"}
                  </Td>
                  <Td>
                    <IconActionButton icon={Eye} label="Xem chi tiết" onClick={() => setOpenReview(r)} />
                  </Td>
                </tr>
              );
            })}
          </DataTable>
        )}

        {data && totalPages > 1 && (
          <div className="flex items-center justify-between gap-4 px-6 py-4">
            <span className="text-[13px] text-star/45">
              Trang {data.page}/{totalPages} — {data.total} đánh giá
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1}
                className="h-9 rounded-lg border border-white/10 px-3 text-[13px] text-star/70 transition-colors hover:border-white/25 disabled:opacity-35"
              >
                Trước
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={data.page >= totalPages}
                className="h-9 rounded-lg border border-white/10 px-3 text-[13px] text-star/70 transition-colors hover:border-white/25 disabled:opacity-35"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </Panel>

      {openReview && (
        <ReviewModerationModal
          review={openReview}
          onClose={() => setOpenReview(null)}
          onChanged={applyChanged}
        />
      )}
    </div>
  );
}
