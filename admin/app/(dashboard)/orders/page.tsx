"use client";

import { useState } from "react";
import { Eye } from "@phosphor-icons/react";
import {
  Badge,
  type BadgeTone,
  DataTable,
  GhostButton,
  Panel,
  PageHeader,
  PreviewNote,
  TabBar,
  Td,
  formatVnd,
} from "../../../components/dashboard/ui";

interface Order {
  code: string;
  buyer: string;
  shop: string;
  total: number;
  status: "pending" | "shipping" | "delivered" | "cancelled";
  date: string;
}

const ORDERS: Order[] = [
  { code: "MK25081201", buyer: "Trần Minh An", shop: "Gốm Bát Tràng", total: 458_000, status: "shipping", date: "12/08 09:20" },
  { code: "MK25081198", buyer: "Nguyễn Thu Hà", shop: "Dao Thái Hoà", total: 1_250_000, status: "delivered", date: "12/08 08:05" },
  { code: "MK25081187", buyer: "Lê Quốc Bảo", shop: "Trà Shan Tuyết", total: 320_000, status: "pending", date: "11/08 21:40" },
  { code: "MK25081179", buyer: "Phạm Gia Hân", shop: "Lụa Vạn Phúc", total: 890_000, status: "cancelled", date: "11/08 18:12" },
  { code: "MK25081165", buyer: "Đỗ Anh Tuấn", shop: "Cà phê Buôn Mê", total: 210_000, status: "delivered", date: "11/08 14:55" },
  { code: "MK25081152", buyer: "Vũ Ngọc Diệp", shop: "Gốm Bát Tràng", total: 675_000, status: "shipping", date: "11/08 10:30" },
];

const STATUS: Record<Order["status"], { label: string; tone: BadgeTone }> = {
  pending: { label: "Chờ xác nhận", tone: "warning" },
  shipping: { label: "Đang giao", tone: "info" },
  delivered: { label: "Đã giao", tone: "success" },
  cancelled: { label: "Đã huỷ", tone: "danger" },
};

const TABS = [
  { key: "all", label: "Tất cả", count: ORDERS.length },
  { key: "pending", label: "Chờ xác nhận", count: ORDERS.filter((o) => o.status === "pending").length },
  { key: "shipping", label: "Đang giao", count: ORDERS.filter((o) => o.status === "shipping").length },
  { key: "delivered", label: "Đã giao", count: ORDERS.filter((o) => o.status === "delivered").length },
  { key: "cancelled", label: "Đã huỷ", count: ORDERS.filter((o) => o.status === "cancelled").length },
];

export default function OrdersPage() {
  const [tab, setTab] = useState("all");
  const rows = ORDERS.filter((o) => tab === "all" || o.status === tab);

  return (
    <div>
      <PageHeader title="Đơn hàng" description="Theo dõi và can thiệp khi có tranh chấp giữa người mua và shop." />
      <PreviewNote />

      <Panel padded={false} className="overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <TabBar tabs={TABS} value={tab} onChange={setTab} />
        </div>
        <DataTable columns={["Mã đơn", "Khách", "Gian hàng", "Tổng tiền", "Trạng thái", "Ngày đặt", ""]}>
          {rows.map((o) => (
            <tr key={o.code}>
              <Td className="font-medium text-star/85">{o.code}</Td>
              <Td className="text-star/60">{o.buyer}</Td>
              <Td className="text-star/60">{o.shop}</Td>
              <Td className="text-star/85">{formatVnd(o.total)}</Td>
              <Td>
                <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
              </Td>
              <Td className="text-star/45">{o.date}</Td>
              <Td>
                <GhostButton icon={Eye} disabled className="h-9 px-3 text-[13px]">
                  Chi tiết
                </GhostButton>
              </Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
}
