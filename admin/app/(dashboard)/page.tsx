"use client";

import { useEffect, useState } from "react";
import {
  CircleNotch,
  ClockCounterClockwise,
  Package,
  Receipt,
  Storefront,
  Users,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  Badge,
  DataTable,
  Panel,
  PanelHeader,
  PageHeader,
  StatCard,
  Td,
  formatVnd,
  type BadgeTone,
} from "../../components/dashboard/ui";
import {
  getDashboardOverview,
  type AdminOrderStatus,
  type DashboardOverview,
} from "../../lib/dashboard-api";

const STATUS_LABEL: Record<AdminOrderStatus, { label: string; tone: BadgeTone }> = {
  pending_payment: { label: "Chờ thanh toán", tone: "warning" },
  pending: { label: "Chờ xác nhận", tone: "warning" },
  confirmed: { label: "Đã xác nhận", tone: "info" },
  shipping: { label: "Đang giao", tone: "info" },
  delivered: { label: "Đã giao", tone: "success" },
  cancelled: { label: "Đã huỷ", tone: "danger" },
  returned: { label: "Đã trả hàng", tone: "danger" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

export default function DashboardHome() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDashboardOverview().then((d) => {
      if (!cancelled) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <CircleNotch size={24} className="animate-spin text-star/40" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Tổng quan"
        description="Bức tranh toàn cảnh hoạt động của sàn Merkovia."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tổng người dùng"
          value={(data?.totalUsers ?? 0).toLocaleString("vi-VN")}
          hint="Người mua + người bán"
          icon={Users}
        />
        <StatCard
          label="Gian hàng hoạt động"
          value={(data?.shops.active ?? 0).toLocaleString("vi-VN")}
          hint={`${data?.shops.suspended ?? 0} đang bị đình chỉ`}
          icon={Storefront}
        />
        <StatCard
          label="Đơn hàng hôm nay"
          value={(data?.ordersToday ?? 0).toLocaleString("vi-VN")}
          hint="Tính từ 0h hôm nay"
          icon={Receipt}
        />
        <StatCard
          label="Doanh thu hôm nay"
          value={formatVnd(data?.revenueToday ?? 0)}
          hint="Tổng tiền hàng, chưa trừ hoa hồng"
          icon={Wallet}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel padded={false} className="overflow-hidden xl:col-span-2">
          <div className="p-5 sm:p-6">
            <PanelHeader title="Đơn hàng gần đây" description="5 đơn mới nhất trên toàn sàn" />
          </div>
          {data?.recentOrders.length ? (
            <DataTable columns={["Mã đơn", "Khách", "Gian hàng", "Tổng tiền", "Trạng thái"]}>
              {data.recentOrders.map((o) => (
                <tr key={o.id}>
                  <Td className="font-medium text-star/85">{o.orderCode}</Td>
                  <Td className="text-star/65">{o.buyer}</Td>
                  <Td className="text-star/65">{o.shopName}</Td>
                  <Td className="text-star/85">{formatVnd(o.total)}</Td>
                  <Td>
                    <Badge tone={STATUS_LABEL[o.status]?.tone ?? "neutral"}>
                      {STATUS_LABEL[o.status]?.label ?? o.status}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </DataTable>
          ) : (
            <p className="px-5 pb-6 text-[13px] text-star/40 sm:px-6">Chưa có đơn hàng nào.</p>
          )}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader
              title="Gian hàng bị báo cáo"
              description={`${data?.pendingReportShops.length ?? 0} gian hàng đang chờ xử lý`}
            />
            {data?.pendingReportShops.length ? (
              <ul className="flex flex-col gap-3">
                {data.pendingReportShops.map((s) => (
                  <li
                    key={s.shopId}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-rose-400">
                      <WarningCircle size={16} weight="duotone" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-star/85">{s.shopName}</p>
                      <p className="text-[12px] text-star/40">{timeAgo(s.latestAt)}</p>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-star/40">Không có báo cáo nào đang chờ.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Hoạt động gần đây" />
            {data?.recentActivity.length ? (
              <ul className="flex flex-col gap-4">
                {data.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-star/40">
                      <ClockCounterClockwise size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug text-star/75">
                        {a.action}
                        {a.targetLabel ? ` — "${a.targetLabel}"` : ""}
                      </p>
                      <p className="text-[11.5px] text-star/35">{timeAgo(a.createdAt)}</p>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-star/40">Chưa có hoạt động nào.</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Sản phẩm chờ duyệt"
          value={(data?.pendingProducts ?? 0).toLocaleString("vi-VN")}
          hint="Đang chờ AI/admin xét"
          icon={Package}
        />
        <StatCard
          label="Chi trả thất bại"
          value={formatVnd(data?.failedPayouts.total ?? 0)}
          hint={`${data?.failedPayouts.count ?? 0} đợt cần đối soát tay`}
          icon={Wallet}
        />
        <StatCard
          label="Tỉ lệ đơn thành công"
          value={data?.successRate != null ? `${data.successRate}%` : "—"}
          hint="30 ngày gần nhất"
          icon={Receipt}
        />
      </div>
    </div>
  );
}
