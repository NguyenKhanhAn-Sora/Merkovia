"use client";

import {
  ClockCounterClockwise,
  Percent,
  ShieldCheck,
  Star,
  Storefront,
  Truck,
  UserMinus,
} from "@phosphor-icons/react";
import { Panel, PageHeader, PreviewNote } from "../../../components/dashboard/ui";

interface LogEntry {
  actor: string;
  action: string;
  detail: string;
  time: string;
  icon: typeof ShieldCheck;
}

const DAYS: { date: string; entries: LogEntry[] }[] = [
  {
    date: "Hôm nay — 12/08/2026",
    entries: [
      { actor: "admin@merkovia.com", action: "Duyệt gian hàng", detail: "“Trà Shan Tuyết” được duyệt hoạt động", time: "08:12", icon: Storefront },
      { actor: "admin@merkovia.com", action: "Khoá tài khoản", detail: "Khoá tài khoản “Lê Quốc Bảo” do vi phạm chính sách", time: "07:40", icon: UserMinus },
    ],
  },
  {
    date: "Hôm qua — 11/08/2026",
    entries: [
      { actor: "admin@merkovia.com", action: "Cập nhật biểu cước", detail: "Sửa mức cước vùng Tây Nguyên, 1–3kg", time: "16:05", icon: Truck },
      { actor: "admin@merkovia.com", action: "Ẩn đánh giá", detail: "Gỡ 1 đánh giá spam trên sản phẩm “Tượng gỗ phong thuỷ”", time: "14:22", icon: Star },
      { actor: "admin@merkovia.com", action: "Đổi hoa hồng sàn", detail: "Hoa hồng sàn giữ nguyên 5%, xác nhận lại cấu hình", time: "09:30", icon: Percent },
    ],
  },
];

export default function AuditLogPage() {
  return (
    <div>
      <PageHeader
        title="Nhật ký hoạt động"
        description="Lịch sử thao tác của tài khoản quản trị — phục vụ truy vết khi cần."
      />
      <PreviewNote />

      <div className="flex flex-col gap-6">
        {DAYS.map((day) => (
          <Panel key={day.date}>
            <p className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-star/35">
              {day.date}
            </p>
            <ul className="flex flex-col gap-5">
              {day.entries.map((e, i) => {
                const EntryIcon = e.icon;
                return (
                  <li key={i} className="flex items-start gap-3.5">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-cosmic-violet">
                      <EntryIcon size={16} weight="duotone" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-star/85">{e.action}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-star/55">{e.detail}</p>
                      <p className="mt-1 text-[12px] text-star/35">
                        {e.actor} · {e.time}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))}

        <div className="flex items-center justify-center gap-2 py-2 text-[13px] text-star/30">
          <ClockCounterClockwise size={15} />
          Đã hiển thị các hoạt động gần đây nhất
        </div>
      </div>
    </div>
  );
}
