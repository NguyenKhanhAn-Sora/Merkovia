"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle,
  CircleNotch,
  ClockCounterClockwise,
  MagnifyingGlass,
  Prohibit,
  ShieldCheck,
  XCircle,
  type Icon,
} from "@phosphor-icons/react";
import { Panel, PageHeader } from "../../../components/dashboard/ui";
import { getAuditLog, groupByDay, type AuditLogEntry } from "../../../lib/audit-log-api";

function iconFor(action: string): Icon {
  if (action.includes("Từ chối")) return XCircle;
  if (action.includes("Gỡ đình chỉ")) return ShieldCheck;
  if (action.includes("Đình chỉ")) return Prohibit;
  if (action.includes("Duyệt")) return CheckCircle;
  return ClockCounterClockwise;
}

export default function AuditLogPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getAuditLog(1, 100, q);
    setItems(r.items);
    setLoading(false);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const days = groupByDay(items);

  return (
    <div>
      <PageHeader
        title="Nhật ký hoạt động"
        description="Lịch sử thao tác của tài khoản quản trị — phục vụ truy vết khi cần."
      />

      <div className="relative mb-6 max-w-sm">
        <MagnifyingGlass
          size={17}
          className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-star/35"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo admin, hành động, đối tượng, chi tiết…"
          aria-label="Tìm trong nhật ký"
          className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-3 text-[13.5px] text-star outline-none transition-colors placeholder:text-star/35 focus:border-cosmic-violet/50"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <CircleNotch size={22} className="animate-spin text-star/40" />
        </div>
      ) : days.length === 0 ? (
        <Panel>
          <p className="py-6 text-center text-[13.5px] text-star/45">
            {q ? "Không tìm thấy hoạt động nào khớp." : "Chưa có hoạt động nào được ghi nhận."}
          </p>
        </Panel>
      ) : (
        <div className="flex flex-col gap-6">
          {days.map((day) => (
            <Panel key={day.date}>
              <p className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-star/35">
                {day.date}
              </p>
              <ul className="flex flex-col gap-5">
                {day.entries.map((e) => {
                  const EntryIcon = iconFor(e.action);
                  return (
                    <li key={e.id} className="flex items-start gap-3.5">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-cosmic-violet">
                        <EntryIcon size={16} weight="duotone" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium text-star/85">
                          {e.action}
                          {e.targetLabel ? ` — "${e.targetLabel}"` : ""}
                        </p>
                        {e.detail && (
                          <p className="mt-0.5 text-[13px] leading-relaxed text-star/55">
                            {e.detail}
                          </p>
                        )}
                        <p className="mt-1 text-[12px] text-star/35">
                          {e.adminEmail} ·{" "}
                          {new Date(e.createdAt).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
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
      )}
    </div>
  );
}
