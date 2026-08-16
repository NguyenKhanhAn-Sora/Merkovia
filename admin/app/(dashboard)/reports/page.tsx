"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleNotch, Eye, Flag, MagnifyingGlass } from "@phosphor-icons/react";
import {
  getReportQueue,
  getReportHistory,
  REPORT_ACTION_LABEL,
  REPORT_REASON_LABEL,
  REPORT_TIER_LABEL,
  type ReportAction,
  type ReportHistoryItem,
  type ReportQueueItem,
  type ReportTier,
} from "../../../lib/shop-reports-api";
import {
  getDisputes,
  CANCEL_REASON_LABEL,
  RETURN_REASON_LABEL,
  type OrderDisputeItem,
} from "../../../lib/order-disputes-api";
import ShopReportModal from "../../../components/dashboard/ShopReportModal";
import DisputeModal from "../../../components/dashboard/DisputeModal";
import {
  Badge,
  type BadgeTone,
  DataTable,
  EmptyState,
  formatVnd,
  GhostButton,
  PageHeader,
  Panel,
  TabBar,
  Td,
} from "../../../components/dashboard/ui";

const TIER_TONE: Record<ReportTier, BadgeTone> = {
  urgent: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

const ACTION_TONE: Record<ReportAction, BadgeTone> = {
  warning: "warning",
  suspend: "danger",
  dismiss: "neutral",
};

const STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  suspended: "danger",
  pending: "warning",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Đang hoạt động",
  suspended: "Đang đình chỉ",
  pending: "Chờ duyệt",
};

/** "3 giờ trước", "2 ngày trước"… — admin cần thấy báo cáo đã chờ/đã xử lý bao lâu. */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "Vừa xong";
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

export default function ReportsPage() {
  const [tab, setTab] = useState<"queue" | "history" | "disputes">("queue");
  const [q, setQ] = useState("");

  const [items, setItems] = useState<ReportQueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState("");

  const [history, setHistory] = useState<ReportHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  const [disputes, setDisputes] = useState<OrderDisputeItem[]>([]);
  const [disputesLoading, setDisputesLoading] = useState(true);
  const [disputesError, setDisputesError] = useState("");

  const [openShopId, setOpenShopId] = useState<string | null>(null);
  const [openDispute, setOpenDispute] = useState<OrderDisputeItem | null>(null);

  // Hàng đợi/lịch sử lọc thẳng ở server theo tên gian hàng (query `q`) — mỗi
  // shop mỗi dòng nên bộ nhớ nhỏ, nhưng vẫn nhất quán với cách các trang khác
  // trong phiên này đã làm (Khuyến mãi, Nhật ký hoạt động).
  const loadQueue = useCallback((term: string) => {
    setQueueLoading(true);
    getReportQueue(term)
      .then(setItems)
      .catch((e: unknown) =>
        setQueueError(e instanceof Error ? e.message : "Không tải được hàng đợi báo cáo."),
      )
      .finally(() => setQueueLoading(false));
  }, []);

  const loadHistory = useCallback((term: string) => {
    setHistoryLoading(true);
    getReportHistory(term)
      .then(setHistory)
      .catch((e: unknown) =>
        setHistoryError(e instanceof Error ? e.message : "Không tải được lịch sử xử lý."),
      )
      .finally(() => setHistoryLoading(false));
  }, []);

  const loadDisputes = useCallback(() => {
    setDisputesLoading(true);
    getDisputes()
      .then(setDisputes)
      .catch((e: unknown) =>
        setDisputesError(e instanceof Error ? e.message : "Không tải được danh sách tranh chấp."),
      )
      .finally(() => setDisputesLoading(false));
  }, []);

  // Dùng sau khi resolve/unsuspend một shop — phải nạp lại ĐÚNG từ khoá đang
  // gõ (không phải rỗng), nếu không sẽ có bug đóng gói cũ: sửa xong một shop
  // đang lọc theo tên rồi danh sách bỗng nạp lại KHÔNG lọc.
  const loadAll = useCallback(() => {
    loadQueue(q);
    loadHistory(q);
    loadDisputes();
  }, [loadQueue, loadHistory, loadDisputes, q]);

  // Nạp danh sách tranh chấp một lần khi vào trang — tab đó không gọi lại
  // API theo từ khoá, lọc ngay trên dữ liệu đã có (xem `filteredDisputes`).
  useEffect(() => {
    loadDisputes();
  }, [loadDisputes]);

  // Hàng đợi/lịch sử nạp lại theo `q`, có debounce khi đang gõ.
  useEffect(() => {
    const t = setTimeout(
      () => {
        loadQueue(q);
        loadHistory(q);
      },
      q ? 400 : 0,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  /** Tranh chấp không có API tìm kiếm riêng — lọc ngay trên danh sách đã tải. */
  const filteredDisputes = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return disputes;
    return disputes.filter(
      (d) =>
        d.orderCode.toLowerCase().includes(term) ||
        d.shopName.toLowerCase().includes(term) ||
        d.buyerContact.toLowerCase().includes(term),
    );
  }, [disputes, q]);

  return (
    <div>
      <PageHeader
        title="Báo cáo"
        description="Hàng đợi ưu tiên xử lý báo cáo vi phạm gian hàng, và lịch sử các quyết định đã đưa ra."
      />

      <Panel padded={false} className="overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <TabBar
            tabs={[
              { key: "queue", label: "Đang chờ xử lý", count: items.length },
              { key: "history", label: "Lịch sử xử lý", count: history.length },
              { key: "disputes", label: "Tranh chấp đơn hàng", count: filteredDisputes.length },
            ]}
            value={tab}
            onChange={(k) => setTab(k as "queue" | "history" | "disputes")}
          />
          <div className="relative mb-5 max-w-sm">
            <MagnifyingGlass
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-star/35"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                tab === "disputes"
                  ? "Tìm theo mã đơn, gian hàng, người mua…"
                  : "Tìm theo tên gian hàng…"
              }
              aria-label="Tìm báo cáo"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-3 text-[13.5px] text-star outline-none transition-colors placeholder:text-star/35 focus:border-cosmic-violet/50"
            />
          </div>
        </div>

        {tab === "queue" &&
          (queueLoading ? (
            <div className="flex justify-center py-16">
              <CircleNotch size={22} className="animate-spin text-star/40" />
            </div>
          ) : queueError ? (
            <p className="px-6 py-10 text-center text-[13.5px] text-rose-300">{queueError}</p>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Flag}
              title={q ? "Không tìm thấy gian hàng nào khớp" : "Không có báo cáo nào đang chờ"}
              description={
                q
                  ? "Thử một tên gian hàng khác."
                  : "Mọi báo cáo vi phạm gian hàng đã được xử lý."
              }
            />
          ) : (
            <DataTable
              columns={["Gian hàng", "Mức độ", "Điểm", "Số người báo cáo", "Lý do", "Chờ từ", ""]}
            >
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
          ))}

        {tab === "history" &&
          (historyLoading ? (
            <div className="flex justify-center py-16">
              <CircleNotch size={22} className="animate-spin text-star/40" />
            </div>
          ) : historyError ? (
            <p className="px-6 py-10 text-center text-[13.5px] text-rose-300">{historyError}</p>
          ) : history.length === 0 ? (
            <EmptyState
              icon={Flag}
              title={q ? "Không tìm thấy gian hàng nào khớp" : "Chưa có báo cáo nào được xử lý"}
              description={
                q
                  ? "Thử một tên gian hàng khác."
                  : "Lịch sử quyết định (cảnh cáo, đình chỉ, bỏ qua) sẽ hiện ở đây."
              }
            />
          ) : (
            <DataTable
              columns={["Gian hàng", "Quyết định", "Trạng thái hiện tại", "Tổng số báo cáo", "Xử lý lúc", ""]}
            >
              {history.map((it) => (
                <tr key={it.shopId}>
                  <Td className="font-medium text-star/85">{it.shopName}</Td>
                  <Td>
                    <Badge tone={ACTION_TONE[it.lastAction]}>
                      {REPORT_ACTION_LABEL[it.lastAction]}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[it.shopStatus] ?? "neutral"}>
                      {STATUS_LABEL[it.shopStatus] ?? it.shopStatus}
                    </Badge>
                    {it.shopStatus === "suspended" && it.suspendedUntil && (
                      <span className="ml-2 text-[11.5px] text-star/40">
                        tới{" "}
                        {new Date(it.suspendedUntil).toLocaleDateString("vi-VN", {
                          dateStyle: "medium",
                        })}
                      </span>
                    )}
                  </Td>
                  <Td className="text-star/70">{it.totalReports}</Td>
                  <Td className="text-star/50">{timeAgo(it.lastActionAt)}</Td>
                  <Td>
                    <GhostButton
                      icon={Eye}
                      onClick={() => setOpenShopId(it.shopId)}
                      className="h-9 px-3 text-[13px]"
                    >
                      Xem chi tiết
                    </GhostButton>
                  </Td>
                </tr>
              ))}
            </DataTable>
          ))}

        {tab === "disputes" &&
          (disputesLoading ? (
            <div className="flex justify-center py-16">
              <CircleNotch size={22} className="animate-spin text-star/40" />
            </div>
          ) : disputesError ? (
            <p className="px-6 py-10 text-center text-[13.5px] text-rose-300">{disputesError}</p>
          ) : filteredDisputes.length === 0 ? (
            <EmptyState
              icon={Flag}
              title={q ? "Không tìm thấy tranh chấp nào khớp" : "Không có tranh chấp nào cần xử lý"}
              description={
                q
                  ? "Thử một từ khoá khác — mã đơn, tên gian hàng, hoặc thông tin người mua."
                  : "Yêu cầu huỷ/trả hàng của gian hàng đang bị đình chỉ sẽ hiện ở đây — shop bị đình chỉ không được tự duyệt."
              }
            />
          ) : (
            <DataTable
              columns={["Đơn hàng", "Gian hàng", "Loại", "Lý do", "Người mua", "Số tiền", "Yêu cầu lúc", ""]}
            >
              {filteredDisputes.map((d) => (
                <tr key={`${d.type}-${d.orderId}`}>
                  <Td className="font-medium text-star/85">{d.orderCode}</Td>
                  <Td className="text-star/70">{d.shopName}</Td>
                  <Td>
                    <Badge tone={d.type === "cancel" ? "warning" : "info"}>
                      {d.type === "cancel" ? "Huỷ đơn" : "Trả hàng"}
                    </Badge>
                  </Td>
                  <Td className="max-w-[220px] truncate text-star/55">
                    {d.reasonType
                      ? ((d.type === "cancel" ? CANCEL_REASON_LABEL : RETURN_REASON_LABEL)[
                          d.reasonType
                        ] ?? d.reasonType)
                      : "—"}
                  </Td>
                  <Td className="text-star/60">{d.buyerContact}</Td>
                  <Td className="text-star/85">{formatVnd(d.total)}</Td>
                  <Td className="text-star/50">{timeAgo(d.requestedAt)}</Td>
                  <Td>
                    <GhostButton
                      icon={Eye}
                      onClick={() => setOpenDispute(d)}
                      className="h-9 px-3 text-[13px]"
                    >
                      Xử lý
                    </GhostButton>
                  </Td>
                </tr>
              ))}
            </DataTable>
          ))}
      </Panel>

      {openShopId && (
        <ShopReportModal
          shopId={openShopId}
          onClose={() => setOpenShopId(null)}
          onResolved={loadAll}
        />
      )}

      {openDispute && (
        <DisputeModal
          dispute={openDispute}
          onClose={() => setOpenDispute(null)}
          onResolved={loadDisputes}
        />
      )}
    </div>
  );
}
