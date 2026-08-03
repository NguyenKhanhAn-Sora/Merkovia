"use client";

import { useState } from "react";
import { Check, Eye, X } from "@phosphor-icons/react";
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

interface Shop {
  name: string;
  owner: string;
  products: number;
  revenue: number;
  status: "active" | "pending" | "suspended";
}

const SHOPS: Shop[] = [
  { name: "Gốm Bát Tràng", owner: "Nguyễn Văn Long", products: 84, revenue: 128_400_000, status: "active" },
  { name: "Dao Thái Hoà", owner: "Trần Thái Hoà", products: 32, revenue: 96_200_000, status: "active" },
  { name: "Trà Shan Tuyết", owner: "Lý Thị Mai", products: 19, revenue: 41_000_000, status: "active" },
  { name: "Mộc Mỹ Nghệ Sài Gòn", owner: "Vũ Đình Khang", products: 0, revenue: 0, status: "pending" },
  { name: "Nón Lá Huế Xưa", owner: "Hồ Thị Xuân", products: 0, revenue: 0, status: "pending" },
  { name: "Lụa Vạn Phúc", owner: "Đặng Quang Huy", products: 57, revenue: 210_500_000, status: "active" },
  { name: "Chợ Đồ Cũ Sài Gòn", owner: "Ngô Bảo Châu", products: 12, revenue: 3_200_000, status: "suspended" },
];

const STATUS: Record<Shop["status"], { label: string; tone: BadgeTone }> = {
  active: { label: "Đang hoạt động", tone: "success" },
  pending: { label: "Chờ duyệt", tone: "warning" },
  suspended: { label: "Tạm đình chỉ", tone: "danger" },
};

const TABS = [
  { key: "all", label: "Tất cả", count: SHOPS.length },
  { key: "active", label: "Đang hoạt động", count: SHOPS.filter((s) => s.status === "active").length },
  { key: "pending", label: "Chờ duyệt", count: SHOPS.filter((s) => s.status === "pending").length },
  { key: "suspended", label: "Tạm đình chỉ", count: SHOPS.filter((s) => s.status === "suspended").length },
];

export default function ShopsPage() {
  const [tab, setTab] = useState("all");
  const rows = SHOPS.filter((s) => tab === "all" || s.status === tab);

  return (
    <div>
      <PageHeader title="Gian hàng" description="Duyệt shop mới, theo dõi hoạt động và xử lý vi phạm." />
      <PreviewNote />

      <Panel padded={false} className="overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <TabBar tabs={TABS} value={tab} onChange={setTab} />
        </div>
        <DataTable columns={["Gian hàng", "Chủ sở hữu", "Sản phẩm", "Doanh thu", "Trạng thái", ""]}>
          {rows.map((s) => (
            <tr key={s.name}>
              <Td className="font-medium text-star/85">{s.name}</Td>
              <Td className="text-star/60">{s.owner}</Td>
              <Td className="text-star/60">{s.products}</Td>
              <Td className="text-star/85">{formatVnd(s.revenue)}</Td>
              <Td>
                <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
              </Td>
              <Td>
                {s.status === "pending" ? (
                  <span className="flex gap-1.5">
                    <GhostButton icon={Check} disabled className="h-9 px-3 text-[13px]">
                      Duyệt
                    </GhostButton>
                    <GhostButton icon={X} disabled className="h-9 px-3 text-[13px]">
                      Từ chối
                    </GhostButton>
                  </span>
                ) : (
                  <GhostButton icon={Eye} disabled className="h-9 px-3 text-[13px]">
                    Chi tiết
                  </GhostButton>
                )}
              </Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
}
