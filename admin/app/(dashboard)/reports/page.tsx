"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleNotch, Eye, Flag } from "@phosphor-icons/react";
import {
  getReportQueue,
  REPORT_REASON_LABEL,
  REPORT_TIER_LABEL,
  type ReportQueueItem,
  type ReportTier,
} from "../../../lib/shop-reports-api";
import ShopReportModal from "../../../components/dashboard/ShopReportModal";
import {
  Badge,
  type BadgeTone,
  DataTable,
  EmptyState,
  GhostButton,
  PageHeader,
  Panel,
  Td,
} from "../../../components/dashboard/ui";

const TIER_TONE: Record<ReportTier, BadgeTone> = {
  urgent: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

/** "3 giờ trước", "2 ngày trước"… — admin cần thấy báo cáo đã chờ bao lâu để ưu tiên đúng. */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "Vừa xong";
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

export default function ReportsPage() {
  const [items, setItems] = useState<ReportQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openShopId, setOpenShopId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getReportQueue()
      .then(setItems)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Không tải được hàng đợi báo cáo."),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Báo cáo"
        description="Hàng đợi ưu tiên xử lý báo cáo vi phạm gian hàng — gộp theo shop, khẩn cấp nhất lên đầu."
      />

      <Panel padded={false} className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <CircleNotch size={22} className="animate-spin text-star/40" />
          </div>
        ) : error ? (
          <p className="px-6 py-10 text-center text-[13.5px] text-rose-300">{error}</p>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Flag}
            title="Không có báo cáo nào đang chờ"
            description="Mọi báo cáo vi phạm gian hàng đã được xử lý."
          />
        ) : (
          <DataTable columns={["Gian hàng", "Mức độ", "Điểm", "Số người báo cáo", "Lý do", "Chờ từ", ""]}>
            {items.map((it) => (
              <tr key={it.shopId}>
                <Td className="font-medium text-star/85">{it.shopName}</Td>
                <Td>
                  <Badge tone={TIER_TONE[it.tier]}>{REPORT_TIER_LABEL[it.tier]}</Badge>
                </Td>
                <Td className="text-star/50">
                  <span title="Điểm = Σ (mức nghiêm trọng × độ tin cậy người báo cáo)">
                    {it.score}
                  </span>
                </Td>
                <Td className="text-star/70">{it.reportCount}</Td>
                <Td className="max-w-[260px] truncate text-star/55">
                  {it.reasons.map((r) => REPORT_REASON_LABEL[r] ?? r).join(", ")}
                </Td>
                <Td className="text-star/50">{timeAgo(it.oldestReportAt)}</Td>
                <Td>
                  <GhostButton
                    icon={Eye}
                    onClick={() => setOpenShopId(it.shopId)}
                    className="h-9 px-3 text-[13px]"
                  >
                    Xem & xử lý
                  </GhostButton>
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>

      {openShopId && (
        <ShopReportModal
          shopId={openShopId}
          onClose={() => setOpenShopId(null)}
          onResolved={load}
        />
      )}
    </div>
  );
}
