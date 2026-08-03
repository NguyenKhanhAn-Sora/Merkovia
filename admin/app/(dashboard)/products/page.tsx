"use client";

import { useState } from "react";
import { Eye, Package } from "@phosphor-icons/react";
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

interface Product {
  name: string;
  shop: string;
  category: string;
  price: number;
  stock: number;
  status: "selling" | "hidden" | "flagged";
}

const PRODUCTS: Product[] = [
  { name: "Bộ ấm trà gốm men lam", shop: "Gốm Bát Tràng", category: "Đồ gia dụng", price: 458_000, stock: 24, status: "selling" },
  { name: "Dao phay đầu bếp thép carbon", shop: "Dao Thái Hoà", category: "Dụng cụ bếp", price: 1_250_000, stock: 8, status: "selling" },
  { name: "Trà Shan Tuyết cổ thụ 200g", shop: "Trà Shan Tuyết", category: "Thực phẩm", price: 320_000, stock: 0, status: "hidden" },
  { name: "Khăn lụa tơ tằm hoạ tiết", shop: "Lụa Vạn Phúc", category: "Thời trang", price: 890_000, stock: 15, status: "selling" },
  { name: "Tượng gỗ trang trí phong thuỷ", shop: "Mộc Mỹ Nghệ Sài Gòn", category: "Trang trí", price: 2_100_000, stock: 3, status: "flagged" },
];

const STATUS: Record<Product["status"], { label: string; tone: BadgeTone }> = {
  selling: { label: "Đang bán", tone: "success" },
  hidden: { label: "Đã ẩn", tone: "neutral" },
  flagged: { label: "Bị báo cáo", tone: "danger" },
};

const TABS = [
  { key: "all", label: "Tất cả", count: PRODUCTS.length },
  { key: "selling", label: "Đang bán", count: PRODUCTS.filter((p) => p.status === "selling").length },
  { key: "flagged", label: "Bị báo cáo", count: PRODUCTS.filter((p) => p.status === "flagged").length },
];

export default function ProductsPage() {
  const [tab, setTab] = useState("all");
  const rows = PRODUCTS.filter((p) => tab === "all" || p.status === tab);

  return (
    <div>
      <PageHeader title="Sản phẩm" description="Kiểm duyệt nội dung sản phẩm trên toàn sàn." />
      <PreviewNote />

      <Panel padded={false} className="overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <TabBar tabs={TABS} value={tab} onChange={setTab} />
        </div>
        <DataTable columns={["Sản phẩm", "Gian hàng", "Danh mục", "Giá", "Kho", "Trạng thái", ""]}>
          {rows.map((p) => (
            <tr key={p.name}>
              <Td className="font-medium text-star/85">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-star/30">
                    <Package size={16} />
                  </span>
                  <span className="max-w-[220px] truncate">{p.name}</span>
                </span>
              </Td>
              <Td className="text-star/60">{p.shop}</Td>
              <Td className="text-star/60">{p.category}</Td>
              <Td className="text-star/85">{formatVnd(p.price)}</Td>
              <Td className="text-star/60">{p.stock}</Td>
              <Td>
                <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
              </Td>
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
