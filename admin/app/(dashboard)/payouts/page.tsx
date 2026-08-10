"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, MagnifyingGlass, Warning, Wallet } from "@phosphor-icons/react";
import {
  Badge,
  type BadgeTone,
  DataTable,
  GhostButton,
  Panel,
  PageHeader,
  StatCard,
  TabBar,
  Td,
  formatVnd,
} from "../../../components/dashboard/ui";
import PayoutDetailModal from "../../../components/dashboard/PayoutDetailModal";
import {
  getPayouts,
  type AdminPayoutListItem,
  type AdminPayoutListResult,
  type PayoutStatus,
} from "../../../lib/payouts-api";

const STATUS: Record<PayoutStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Chờ gửi lệnh", tone: "neutral" },
  processing: { label: "Đang xử lý", tone: "warning" },
  paid: { label: "Đã chuyển", tone: "success" },
  failed: { label: "Thất bại", tone: "danger" },
};

type Tab = PayoutStatus | "all";

const TAB_ORDER: Tab[] = ["all", "processing", "pending", "paid", "failed"];

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

export default function PayoutsPage() {
  const [tab, setTab] = useState<Tab>("processing");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AdminPayoutListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setData(await getPayouts({ status: tab, q, page, limit: 20 }));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Không tải được danh sách đợt chi.");
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
        title="Đối soát & Rút tiền"
        description="Rút tiền cho người bán chạy tự động — trang này để đối soát các đợt chi bị kẹt và tra cứu lịch sử."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Đang kẹt — cần đối soát"
          value={String(c?.processing ?? "—")}
          hint="Trạng thái processing"
          icon={Warning}
        />
        <StatCard label="Đã chuyển thành công" value={String(c?.paid ?? "—")} icon={Wallet} />
        <StatCard label="Thất bại (đã nhả đơn)" value={String(c?.failed ?? "—")} icon={Warning} />
      </div>

      <Panel padded={false} className="mt-6 overflow-hidden">
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
              placeholder="Tìm theo mã đợt chi, tên gian hàng…"
              aria-label="Tìm đợt chi trả"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-3 text-[13.5px] text-star outline-none transition-colors placeholder:text-star/35 focus:border-cosmic-violet/50"
            />
          </div>
        </div>

        {loadError ? (
          <p className="px-6 pb-6 text-[13.5px] text-rose-300">{loadError}</p>
        ) : !loading && data && data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-star/40">
            <Wallet size={28} />
            <p className="text-[13.5px]">Không có đợt chi nào ở mục này.</p>
          </div>
        ) : (
          <DataTable columns={["Mã đợt chi", "Gian hàng", "Số tiền", "Trạng thái", "Ngày tạo", ""]}>
            {(data?.items ?? []).map((p: AdminPayoutListItem) => (
              <tr key={p.id}>
                <Td className="font-medium text-star/85">{p.code}</Td>
                <Td className="text-star/60">{p.shop.name}</Td>
                <Td className="text-star/85">{formatVnd(p.netAmount)}</Td>
                <Td>
                  <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                </Td>
                <Td className="text-star/45">{formatDate(p.createdAt)}</Td>
                <Td>
                  <GhostButton icon={Eye} onClick={() => setOpenId(p.id)} className="h-9 px-3 text-[13px]">
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
              Trang {data.page}/{totalPages} — {data.total} đợt chi
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

      {openId && (
        <PayoutDetailModal
          payoutId={openId}
          onClose={() => setOpenId(null)}
          onResolved={() => void load()}
        />
      )}
    </div>
  );
}
