"use client";

import { useState } from "react";
import { EyeSlash, Flag, Star } from "@phosphor-icons/react";
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
} from "../../../components/dashboard/ui";

interface Review {
  product: string;
  buyer: string;
  shop: string;
  rating: number;
  comment: string;
  status: "visible" | "flagged" | "hidden";
  date: string;
}

const REVIEWS: Review[] = [
  { product: "Bộ ấm trà gốm men lam", buyer: "Trần Minh An", shop: "Gốm Bát Tràng", rating: 5, comment: "Sản phẩm đẹp, đóng gói cẩn thận, giao nhanh.", status: "visible", date: "10/08/2026" },
  { product: "Dao phay đầu bếp thép carbon", buyer: "Nguyễn Thu Hà", shop: "Dao Thái Hoà", rating: 1, comment: "Link web abc.xyz giảm giá 90%, mua ngay!!!", status: "flagged", date: "09/08/2026" },
  { product: "Khăn lụa tơ tằm hoạ tiết", buyer: "Phạm Gia Hân", shop: "Lụa Vạn Phúc", rating: 4, comment: "Chất liệu ổn, màu hơi khác ảnh một chút.", status: "visible", date: "08/08/2026" },
  { product: "Tượng gỗ trang trí phong thuỷ", buyer: "Lê Quốc Bảo", shop: "Mộc Mỹ Nghệ Sài Gòn", rating: 2, comment: "Spam quảng cáo không liên quan sản phẩm.", status: "hidden", date: "07/08/2026" },
  { product: "Trà Shan Tuyết cổ thụ 200g", buyer: "Đỗ Anh Tuấn", shop: "Trà Shan Tuyết", rating: 5, comment: "Trà thơm, vị đậm, sẽ ủng hộ tiếp.", status: "visible", date: "06/08/2026" },
];

const STATUS: Record<Review["status"], { label: string; tone: BadgeTone }> = {
  visible: { label: "Hiển thị", tone: "success" },
  flagged: { label: "Bị báo cáo", tone: "danger" },
  hidden: { label: "Đã ẩn", tone: "neutral" },
};

const TABS = [
  { key: "all", label: "Tất cả", count: REVIEWS.length },
  { key: "flagged", label: "Bị báo cáo", count: REVIEWS.filter((r) => r.status === "flagged").length },
  { key: "hidden", label: "Đã ẩn", count: REVIEWS.filter((r) => r.status === "hidden").length },
];

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5 text-amber-400">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={13} weight={i < value ? "fill" : "regular"} className={i < value ? "" : "text-star/20"} />
      ))}
    </span>
  );
}

export default function ReviewsPage() {
  const [tab, setTab] = useState("all");
  const rows = REVIEWS.filter((r) => tab === "all" || r.status === tab);

  return (
    <div>
      <PageHeader title="Đánh giá" description="Kiểm duyệt đánh giá spam hoặc vi phạm chính sách nội dung." />
      <PreviewNote />

      <Panel padded={false} className="overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <TabBar tabs={TABS} value={tab} onChange={setTab} />
        </div>
        <DataTable columns={["Sản phẩm", "Người đánh giá", "Đánh giá", "Gian hàng", "Trạng thái", "Ngày", ""]}>
          {rows.map((r, i) => (
            <tr key={i}>
              <Td className="max-w-[180px] truncate font-medium text-star/85">{r.product}</Td>
              <Td className="text-star/60">{r.buyer}</Td>
              <Td className="max-w-[260px]">
                <Stars value={r.rating} />
                <p className="mt-1 truncate text-[12.5px] text-star/45">{r.comment}</p>
              </Td>
              <Td className="text-star/60">{r.shop}</Td>
              <Td>
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
              </Td>
              <Td className="text-star/45">{r.date}</Td>
              <Td>
                <span className="flex gap-1.5">
                  <GhostButton icon={EyeSlash} disabled className="h-9 w-9 px-0" />
                  <GhostButton icon={Flag} disabled className="h-9 w-9 px-0" />
                </span>
              </Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
}
