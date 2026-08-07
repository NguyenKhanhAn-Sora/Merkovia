/** Client cho trang "Nhật ký hoạt động" — lịch sử thao tác của tài khoản quản trị. */
import { apiFetch } from "./auth-api";

export interface AuditLogEntry {
  id: string;
  adminEmail: string;
  action: string;
  targetLabel?: string;
  detail?: string;
  createdAt: string;
}

export interface AuditLogResult {
  items: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

const EMPTY: AuditLogResult = { items: [], total: 0, page: 1, limit: 50 };

export async function getAuditLog(page = 1, limit = 50): Promise<AuditLogResult> {
  try {
    const res = await apiFetch(`/admin/audit-log?page=${page}&limit=${limit}`);
    if (!res.ok) return EMPTY;
    return (await res.json()) as AuditLogResult;
  } catch {
    return EMPTY;
  }
}

/** Nhóm các dòng log theo ngày (giờ VN) để hiển thị dạng "Hôm nay / Hôm qua / ...". */
export function groupByDay(items: AuditLogEntry[]): { date: string; entries: AuditLogEntry[] }[] {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const groups = new Map<string, AuditLogEntry[]>();
  for (const item of items) {
    const d = new Date(item.createdAt);
    const label = sameDay(d, today)
      ? "Hôm nay"
      : sameDay(d, yesterday)
        ? "Hôm qua"
        : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
    const arr = groups.get(label) ?? [];
    arr.push(item);
    groups.set(label, arr);
  }
  return [...groups.entries()].map(([date, entries]) => ({ date, entries }));
}
