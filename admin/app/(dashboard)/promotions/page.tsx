"use client";

import { Lightning, Plus } from "@phosphor-icons/react";
import {
  Badge,
  type BadgeTone,
  Panel,
  PageHeader,
  PreviewNote,
  PrimaryButton,
} from "../../../components/dashboard/ui";

interface Campaign {
  name: string;
  window: string;
  products: number;
  status: "live" | "upcoming" | "ended";
}

const CAMPAIGNS: Campaign[] = [
  { name: "Flash Sale Giữa Tháng", window: "12/08 – 14/08/2026", products: 340, status: "live" },
  { name: "Ngày Hội Làng Nghề", window: "20/08 – 22/08/2026", products: 0, status: "upcoming" },
  { name: "Sale Đôi 8.8", window: "08/08/2026", products: 512, status: "ended" },
  { name: "Ưu Đãi Khai Trương Shop Mới", window: "Không giới hạn", products: 45, status: "live" },
];

const STATUS: Record<Campaign["status"], { label: string; tone: BadgeTone }> = {
  live: { label: "Đang diễn ra", tone: "success" },
  upcoming: { label: "Sắp diễn ra", tone: "info" },
  ended: { label: "Đã kết thúc", tone: "neutral" },
};

export default function PromotionsPage() {
  return (
    <div>
      <PageHeader
        title="Khuyến mãi"
        description="Chiến dịch flash sale và ưu đãi áp dụng toàn sàn."
        action={
          <PrimaryButton icon={Plus} disabled>
            Tạo chiến dịch
          </PrimaryButton>
        }
      />
      <PreviewNote />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CAMPAIGNS.map((c) => (
          <Panel key={c.name} className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cosmic-fuchsia/15 blur-3xl"
              aria-hidden
            />
            <div className="relative flex items-start justify-between gap-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-cosmic-violet">
                <Lightning size={19} weight="duotone" />
              </span>
              <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
            </div>
            <p className="relative mt-4 text-[15px] font-semibold text-star">{c.name}</p>
            <p className="relative mt-1 text-[13px] text-star/50">{c.window}</p>
            <p className="relative mt-3 text-[12.5px] text-star/40">{c.products} sản phẩm tham gia</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
