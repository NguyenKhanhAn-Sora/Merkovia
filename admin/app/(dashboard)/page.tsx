"use client";

import {
  CheckCircle,
  ClockCounterClockwise,
  Receipt,
  Star,
  Storefront,
  Users,
  Wallet,
} from "@phosphor-icons/react";
import {
  Badge,
  DataTable,
  Panel,
  PanelHeader,
  PageHeader,
  PreviewNote,
  StatCard,
  Td,
  formatVnd,
} from "../../components/dashboard/ui";

const RECENT_ORDERS = [
  { code: "MK25081201", buyer: "Trần Minh An", shop: "Gốm Bát Tràng", total: 458000, status: "Đang giao", tone: "info" as const },
  { code: "MK25081198", buyer: "Nguyễn Thu Hà", shop: "Dao Thái Hoà", total: 1250000, status: "Đã giao", tone: "success" as const },
  { code: "MK25081187", buyer: "Lê Quốc Bảo", shop: "Trà Shan Tuyết", total: 320000, status: "Chờ xác nhận", tone: "warning" as const },
  { code: "MK25081179", buyer: "Phạm Gia Hân", shop: "Lụa Vạn Phúc", total: 890000, status: "Đã huỷ", tone: "danger" as const },
  { code: "MK25081165", buyer: "Đỗ Anh Tuấn", shop: "Cà phê Buôn Mê", total: 210000, status: "Đã giao", tone: "success" as const },
];

const PENDING_SHOPS = [
  { name: "Mộc Mỹ Nghệ Sài Gòn", since: "2 giờ trước" },
  { name: "Nón Lá Huế Xưa", since: "5 giờ trước" },
  { name: "Gốm Sứ Minh Long", since: "1 ngày trước" },
];

const RECENT_ACTIVITY = [
  { text: "Duyệt gian hàng “Trà Shan Tuyết”", time: "08:12" },
  { text: "Khoá tài khoản vi phạm chính sách", time: "07:40" },
  { text: "Cập nhật biểu cước vùng Tây Nguyên", time: "Hôm qua" },
  { text: "Gỡ 1 đánh giá spam", time: "Hôm qua" },
];

export default function DashboardHome() {
  return (
    <div>
      <PageHeader
        title="Tổng quan"
        description="Bức tranh toàn cảnh hoạt động của sàn Merkovia."
      />
      <PreviewNote />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tổng người dùng" value="18.204" hint="Người mua + người bán" icon={Users} trend={4.2} />
        <StatCard label="Gian hàng hoạt động" value="1.032" hint="12 chờ duyệt" icon={Storefront} trend={1.8} />
        <StatCard label="Đơn hàng hôm nay" value="286" hint="So với hôm qua" icon={Receipt} trend={-2.4} />
        <StatCard label="Doanh thu hôm nay" value={formatVnd(84_500_000)} hint="Hoa hồng sàn 5%" icon={Wallet} trend={6.1} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel padded={false} className="overflow-hidden xl:col-span-2">
          <div className="p-5 sm:p-6">
            <PanelHeader title="Đơn hàng gần đây" description="5 đơn mới nhất trên toàn sàn" />
          </div>
          <DataTable columns={["Mã đơn", "Khách", "Gian hàng", "Tổng tiền", "Trạng thái"]}>
            {RECENT_ORDERS.map((o) => (
              <tr key={o.code}>
                <Td className="font-medium text-star/85">{o.code}</Td>
                <Td className="text-star/65">{o.buyer}</Td>
                <Td className="text-star/65">{o.shop}</Td>
                <Td className="text-star/85">{formatVnd(o.total)}</Td>
                <Td>
                  <Badge tone={o.tone}>{o.status}</Badge>
                </Td>
              </tr>
            ))}
          </DataTable>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel>
            <PanelHeader
              title="Gian hàng chờ duyệt"
              description={`${PENDING_SHOPS.length} yêu cầu đang chờ`}
            />
            <ul className="flex flex-col gap-3">
              {PENDING_SHOPS.map((s) => (
                <li
                  key={s.name}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-cosmic-violet">
                    <Storefront size={16} weight="duotone" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-star/85">{s.name}</p>
                    <p className="text-[12px] text-star/40">{s.since}</p>
                  </span>
                  <CheckCircle size={18} className="shrink-0 text-star/25" />
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader title="Hoạt động gần đây" />
            <ul className="flex flex-col gap-4">
              {RECENT_ACTIVITY.map((a, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-star/40">
                    <ClockCounterClockwise size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug text-star/75">{a.text}</p>
                    <p className="text-[11.5px] text-star/35">{a.time}</p>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Đánh giá cần duyệt" value="7" hint="Bị báo cáo / nghi spam" icon={Star} />
        <StatCard label="Chờ đối soát" value={formatVnd(212_000_000)} hint="Đến hạn trong tuần" icon={Wallet} />
        <StatCard label="Tỉ lệ đơn thành công" value="96,4%" hint="30 ngày gần nhất" icon={Receipt} trend={0.6} />
      </div>
    </div>
  );
}
