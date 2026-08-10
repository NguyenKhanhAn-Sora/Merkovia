"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, MagnifyingGlass, Receipt } from "@phosphor-icons/react";
import {
  Badge,
  type BadgeTone,
  DataTable,
  GhostButton,
  Panel,
  PageHeader,
  TabBar,
  Td,
  formatVnd,
} from "../../../components/dashboard/ui";
import OrderDetailModal from "../../../components/dashboard/OrderDetailModal";
import {
  getOrders,
  type AdminOrderListItem,
  type AdminOrderListResult,
  type OrderStatus,
} from "../../../lib/orders-api";

const STATUS: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  pending_payment: { label: "Chờ thanh toán", tone: "neutral" },
  pending: { label: "Chờ xác nhận", tone: "warning" },
  confirmed: { label: "Chờ lấy hàng", tone: "info" },
  shipping: { label: "Đang giao", tone: "info" },
  delivered: { label: "Đã giao", tone: "success" },
  cancelled: { label: "Đã huỷ", tone: "danger" },
  returned: { label: "Đã trả hàng", tone: "danger" },
};

type Tab = OrderStatus | "all";

const TAB_ORDER: Tab[] = [
  "all",
  "pending_payment",
  "pending",
  "confirmed",
  "shipping",
  "delivered",
  "cancelled",
  "returned",
];

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

export default function OrdersPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AdminOrderListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setData(await getOrders({ status: tab, q, page, limit: 20 }));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Không tải được đơn hàng.");
    } finally {
      setLoading(false);
    }
  }, [tab, q, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const c = data?.counts;
  const tabs = TAB_ORDER.map((key) => ({
    key,
    label: key === "all" ? "Tất cả" : STATUS[key].label,
    count: c?.[key],
  }));

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <PageHeader
        title="Đơn hàng"
        description="Tra cứu toàn bộ đơn hàng của sàn. Tranh chấp huỷ/trả hàng của shop bị đình chỉ xử lý ở trang Báo cáo."
      />

      <Panel padded={false} className="overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <TabBar
            tabs={tabs}
            value={tab}
            onChange={(k) => {
              setTab(k as Tab);
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
              placeholder="Tìm theo mã đơn, gian hàng, người nhận, SĐT…"
              aria-label="Tìm đơn hàng"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-3 text-[13.5px] text-star outline-none transition-colors placeholder:text-star/35 focus:border-cosmic-violet/50"
            />
          </div>
        </div>

        {loadError ? (
          <p className="px-6 pb-6 text-[13.5px] text-rose-300">{loadError}</p>
        ) : !loading && data && data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-star/40">
            <Receipt size={28} />
            <p className="text-[13.5px]">Không có đơn hàng nào ở mục này.</p>
          </div>
        ) : (
          <DataTable columns={["Mã đơn", "Khách", "Gian hàng", "Tổng tiền", "Trạng thái", "Ngày đặt", ""]}>
            {(data?.items ?? []).map((o: AdminOrderListItem) => (
              <tr key={o.id}>
                <Td className="font-medium text-star/85">{o.orderCode}</Td>
                <Td className="text-star/60">{o.buyer.contact}</Td>
                <Td className="text-star/60">{o.shop.name}</Td>
                <Td className="text-star/85">{formatVnd(o.total)}</Td>
                <Td>
                  <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
                </Td>
                <Td className="text-star/45">{formatDate(o.createdAt)}</Td>
                <Td>
                  <GhostButton
                    icon={Eye}
                    onClick={() => setOpenId(o.id)}
                    className="h-9 px-3 text-[13px]"
                  >
                    Chi tiết
                  </GhostButton>
                </Td>
              </tr>
            ))}
          </DataTable>
        )}

        {data && totalPages > 1 && (
          <div className="flex items-center justify-between gap-4 px-6 py-4">
            <span className="text-[13px] text-star/45">
              Trang {data.page}/{totalPages} — {data.total} đơn hàng
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

      {openId && <OrderDetailModal orderId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
