"use client";

import { useState } from "react";
import { Check, Percent, ReceiptX, Wallet, X } from "@phosphor-icons/react";
import {
  Badge,
  type BadgeTone,
  DataTable,
  GhostButton,
  Panel,
  PageHeader,
  PreviewNote,
  StatCard,
  TabBar,
  Td,
  formatVnd,
} from "../../../components/dashboard/ui";

interface Payout {
  shop: string;
  amount: number;
  requested: string;
  status: "pending" | "approved" | "paid" | "rejected";
}

const PAYOUTS: Payout[] = [
  { shop: "Gốm Bát Tràng", amount: 42_600_000, requested: "12/08/2026", status: "pending" },
  { shop: "Dao Thái Hoà", amount: 18_900_000, requested: "11/08/2026", status: "approved" },
  { shop: "Lụa Vạn Phúc", amount: 65_200_000, requested: "10/08/2026", status: "paid" },
  { shop: "Trà Shan Tuyết", amount: 9_400_000, requested: "09/08/2026", status: "pending" },
  { shop: "Chợ Đồ Cũ Sài Gòn", amount: 2_100_000, requested: "07/08/2026", status: "rejected" },
];

const STATUS: Record<Payout["status"], { label: string; tone: BadgeTone }> = {
  pending: { label: "Chờ duyệt", tone: "warning" },
  approved: { label: "Đã duyệt", tone: "info" },
  paid: { label: "Đã thanh toán", tone: "success" },
  rejected: { label: "Từ chối", tone: "danger" },
};

const TABS = [
  { key: "all", label: "Tất cả", count: PAYOUTS.length },
  { key: "pending", label: "Chờ duyệt", count: PAYOUTS.filter((p) => p.status === "pending").length },
  { key: "paid", label: "Đã thanh toán", count: PAYOUTS.filter((p) => p.status === "paid").length },
];

export default function PayoutsPage() {
  const [tab, setTab] = useState("all");
  const rows = PAYOUTS.filter((p) => tab === "all" || p.status === tab);

  return (
    <div>
      <PageHeader
        title="Đối soát & Rút tiền"
        description="Duyệt yêu cầu rút tiền của gian hàng và theo dõi hoa hồng sàn."
      />
      <PreviewNote />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Chờ đối soát" value={formatVnd(52_000_000)} hint="2 yêu cầu" icon={Wallet} />
        <StatCard label="Đã thanh toán (tháng này)" value={formatVnd(318_500_000)} icon={ReceiptX} />
        <StatCard label="Hoa hồng sàn" value="5%" hint="Giữ tối thiểu 3 ngày sau giao" icon={Percent} />
      </div>

      <Panel padded={false} className="mt-6 overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <TabBar tabs={TABS} value={tab} onChange={setTab} />
        </div>
        <DataTable columns={["Gian hàng", "Số tiền", "Ngày yêu cầu", "Trạng thái", ""]}>
          {rows.map((p, i) => (
            <tr key={i}>
              <Td className="font-medium text-star/85">{p.shop}</Td>
              <Td className="text-star/85">{formatVnd(p.amount)}</Td>
              <Td className="text-star/50">{p.requested}</Td>
              <Td>
                <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
              </Td>
              <Td>
                {p.status === "pending" ? (
                  <span className="flex gap-1.5">
                    <GhostButton icon={Check} disabled className="h-9 px-3 text-[13px]">
                      Duyệt
                    </GhostButton>
                    <GhostButton icon={X} disabled className="h-9 px-3 text-[13px]">
                      Từ chối
                    </GhostButton>
                  </span>
                ) : (
                  <span className="text-[12.5px] text-star/30">—</span>
                )}
              </Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
}
