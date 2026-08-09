"use client";

import { useCallback, useEffect, useState } from "react";
import { MagnifyingGlass, Prohibit, ShieldCheck } from "@phosphor-icons/react";
import {
  Badge,
  DataTable,
  GhostButton,
  Panel,
  PageHeader,
  TabBar,
  Td,
  type BadgeTone,
} from "../../../components/dashboard/ui";
import ShopSuspendModal from "../../../components/dashboard/ShopSuspendModal";
import {
  getShops,
  type AdminShopListItem,
  type AdminShopListResult,
  type ShopTab,
} from "../../../lib/shops-api";

const STATUS_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Đang hoạt động", tone: "success" },
  pending: { label: "Chờ duyệt", tone: "warning" },
  suspended: { label: "Tạm đình chỉ", tone: "danger" },
};

const BUSINESS_LABEL: Record<string, string> = {
  personal: "Cá nhân",
  household: "Hộ kinh doanh",
  company: "Doanh nghiệp",
};

export default function ShopsPage() {
  const [tab, setTab] = useState<ShopTab>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AdminShopListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalShop, setModalShop] = useState<{ shop: AdminShopListItem; mode: "suspend" | "unsuspend" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getShops({ tab, q, page, limit: 20 }));
    } finally {
      setLoading(false);
    }
  }, [tab, q, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const c = data?.counts;
  const tabs: { key: ShopTab; label: string; count?: number }[] = [
    { key: "all", label: "Tất cả", count: c?.all },
    { key: "active", label: "Đang hoạt động", count: c?.active },
    { key: "suspended", label: "Tạm đình chỉ", count: c?.suspended },
    { key: "pending", label: "Chờ duyệt", count: c?.pending },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <PageHeader
        title="Gian hàng"
        description="Toàn bộ gian hàng trên sàn — đình chỉ/gỡ trực tiếp khi cần, không phụ thuộc báo cáo."
        action={
          <div className="relative w-full max-w-xs">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-star/35"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo tên gian hàng…"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-3 text-[13.5px] text-star outline-none transition-colors placeholder:text-star/35 focus:border-cosmic-violet/50"
            />
          </div>
        }
      />

      <Panel padded={false} className="overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <TabBar
            tabs={tabs}
            value={tab}
            onChange={(k) => {
              setTab(k as ShopTab);
              setPage(1);
            }}
          />
        </div>

        {!loading && data && data.items.length === 0 ? (
          <p className="py-16 text-center text-[13.5px] text-star/40">Không có gian hàng nào ở mục này.</p>
        ) : (
          <DataTable columns={["Gian hàng", "Loại hình", "Trạng thái", "Ngày mở", ""]}>
            {(data?.items ?? []).map((s) => {
              const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.active;
              return (
                <tr key={s.id}>
                  <Td className="font-medium text-star/85">{s.name}</Td>
                  <Td className="text-star/60">{BUSINESS_LABEL[s.businessType] ?? s.businessType}</Td>
                  <Td>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </Td>
                  <Td className="text-star/50">
                    {s.createdAt
                      ? new Date(s.createdAt).toLocaleDateString("vi-VN", { dateStyle: "short" })
                      : "—"}
                  </Td>
                  <Td>
                    {s.status === "suspended" ? (
                      <GhostButton
                        icon={ShieldCheck}
                        onClick={() => setModalShop({ shop: s, mode: "unsuspend" })}
                        className="h-9 px-3 text-[13px]"
                      >
                        Gỡ đình chỉ
                      </GhostButton>
                    ) : (
                      <GhostButton
                        icon={Prohibit}
                        onClick={() => setModalShop({ shop: s, mode: "suspend" })}
                        className="h-9 px-3 text-[13px] text-rose-300 hover:text-rose-200"
                      >
                        Đình chỉ
                      </GhostButton>
                    )}
                  </Td>
                </tr>
              );
            })}
          </DataTable>
        )}

        {data && totalPages > 1 && (
          <div className="flex items-center justify-between gap-4 px-6 py-4">
            <span className="text-[13px] text-star/45">
              Trang {data.page}/{totalPages} — {data.total} gian hàng
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

      {modalShop && (
        <ShopSuspendModal
          shop={modalShop.shop}
          mode={modalShop.mode}
          onClose={() => setModalShop(null)}
          onDone={() => void load()}
        />
      )}
    </div>
  );
}
