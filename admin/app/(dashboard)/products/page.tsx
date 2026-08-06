"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, MagnifyingGlass, Package } from "@phosphor-icons/react";
import {
  Badge,
  DataTable,
  GhostButton,
  Panel,
  PageHeader,
  TabBar,
  Td,
  formatVnd,
  type BadgeTone,
} from "../../../components/dashboard/ui";
import ProductModerationModal from "../../../components/dashboard/ProductModerationModal";
import {
  getProducts,
  type AdminProductListItem,
  type AdminProductListResult,
  type ModerationTab,
} from "../../../lib/products-api";

const MODERATION_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  ok: { label: "Đã duyệt", tone: "success" },
  pending: { label: "Chờ duyệt", tone: "warning" },
  rejected: { label: "Bị từ chối", tone: "danger" },
};

export default function ProductsPage() {
  const [tab, setTab] = useState<ModerationTab>("pending");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AdminProductListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getProducts({ tab, q, page, limit: 20 }));
    } finally {
      setLoading(false);
    }
  }, [tab, q, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const c = data?.counts;
  const tabs: { key: ModerationTab; label: string; count?: number }[] = [
    { key: "pending", label: "Chờ duyệt", count: c?.pending },
    { key: "rejected", label: "Bị từ chối", count: c?.rejected },
    { key: "ok", label: "Đã duyệt", count: c?.ok },
    { key: "all", label: "Tất cả", count: c?.all },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <PageHeader
        title="Sản phẩm"
        description="Hàng đợi kiểm duyệt sản phẩm — AI xét trước, admin duyệt/từ chối tay bất cứ lúc nào."
      />

      <Panel padded={false} className="overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <TabBar
            tabs={tabs}
            value={tab}
            onChange={(k) => {
              setTab(k as ModerationTab);
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
              placeholder="Tìm theo tên sản phẩm…"
              aria-label="Tìm sản phẩm"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-3 text-[13.5px] text-star outline-none transition-colors placeholder:text-star/35 focus:border-cosmic-violet/50"
            />
          </div>
        </div>

        {!loading && data && data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-star/40">
            <Package size={28} />
            <p className="text-[13.5px]">Không có sản phẩm nào ở mục này.</p>
          </div>
        ) : (
          <DataTable columns={["Sản phẩm", "Gian hàng", "Danh mục", "Giá", "Kiểm duyệt", ""]}>
            {(data?.items ?? []).map((p: AdminProductListItem) => {
              const badge = MODERATION_BADGE[p.moderation.state];
              return (
                <tr key={p.id}>
                  <Td className="font-medium text-star/85">
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.05] text-star/30">
                        {p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Package size={16} />
                        )}
                      </span>
                      <span className="max-w-[220px] truncate">{p.name}</span>
                    </span>
                  </Td>
                  <Td className="text-star/60">{p.shop.name}</Td>
                  <Td className="text-star/60">{p.category ?? "—"}</Td>
                  <Td className="text-star/85">{formatVnd(p.priceMin)}</Td>
                  <Td>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </Td>
                  <Td>
                    <GhostButton
                      icon={Eye}
                      onClick={() => setOpenId(p.id)}
                      className="h-9 px-3 text-[13px]"
                    >
                      Chi tiết
                    </GhostButton>
                  </Td>
                </tr>
              );
            })}
          </DataTable>
        )}

        {data && totalPages > 1 && (
          <div className="flex items-center justify-between gap-4 px-6 py-4">
            <span className="text-[13px] text-star/45">
              Trang {data.page}/{totalPages} — {data.total} sản phẩm
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
        <ProductModerationModal
          productId={openId}
          onClose={() => setOpenId(null)}
          onResolved={() => void load()}
        />
      )}
    </div>
  );
}
