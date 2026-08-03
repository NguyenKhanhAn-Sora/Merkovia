"use client";

import type { Icon } from "@phosphor-icons/react";
import { Sparkle, TrendDown, TrendUp } from "@phosphor-icons/react";

/* ------------------------------------------------------------------ *
 *  Panel — tấm kính nền cho mọi khối nội dung trong dashboard.
 * ------------------------------------------------------------------ */
export function Panel({
  children,
  className = "",
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_20px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl ${
        padded ? "p-5 sm:p-6" : ""
      } ${className}`}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold text-star">{title}</h2>
        {description && (
          <p className="mt-1 text-[13px] text-star/50">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}

/* ------------------------------------------------------------------ *
 *  PageHeader — tiêu đề trang + hành động chính.
 * ------------------------------------------------------------------ */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: React.ReactNode;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-star">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-[14px] leading-relaxed text-star/55">
            {description}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}

/* ------------------------------------------------------------------ *
 *  PreviewNote — nhắc rằng dữ liệu trên trang là minh hoạ, chưa đấu nối
 *  thật. Dùng ở mọi trang phác thảo để không gây hiểu nhầm là số liệu
 *  thật của hệ thống.
 * ------------------------------------------------------------------ */
export function PreviewNote({
  children = "Giao diện phác thảo — dữ liệu minh hoạ, chưa đấu nối tính năng thật.",
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center gap-2.5 rounded-2xl border border-cosmic-violet/25 bg-cosmic-violet/[0.06] px-4 py-2.5 text-[12.5px] text-star/65">
      <Sparkle size={15} weight="fill" className="shrink-0 text-cosmic-violet" />
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Buttons
 * ------------------------------------------------------------------ */
export function PrimaryButton({
  children,
  icon: IconCmp,
  onClick,
  type = "button",
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  icon?: Icon;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cosmic-blue via-cosmic-violet to-cosmic-fuchsia px-5 text-[14px] font-semibold text-black/85 shadow-[0_10px_28px_-10px_rgba(14,165,233,0.55)] transition-all duration-300 hover:shadow-[0_14px_34px_-10px_rgba(45,212,191,0.65)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {IconCmp && <IconCmp size={17} weight="bold" />}
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  icon: IconCmp,
  onClick,
  disabled,
  className = "",
}: {
  children?: React.ReactNode;
  icon?: Icon;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[14px] font-medium text-star/75 transition-all duration-300 hover:border-white/20 hover:text-star active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {IconCmp && <IconCmp size={17} weight="regular" />}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 *  StatCard — ô chỉ số KPI.
 * ------------------------------------------------------------------ */
export function StatCard({
  label,
  value,
  hint,
  icon: IconCmp,
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: Icon;
  trend?: number;
}) {
  const up = (trend ?? 0) >= 0;
  return (
    <Panel className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-cosmic-violet/15 blur-3xl"
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-star/55">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-star">
            {value}
          </p>
          {hint && <p className="mt-1.5 text-[12px] text-star/40">{hint}</p>}
          {trend !== undefined && (
            <p
              className={`mt-2 inline-flex items-center gap-1 text-[12px] font-medium ${
                up ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {up ? <TrendUp size={13} weight="bold" /> : <TrendDown size={13} weight="bold" />}
              {up ? "+" : ""}
              {trend}% so với tuần trước
            </p>
          )}
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-cosmic-violet">
          <IconCmp size={19} weight="duotone" />
        </span>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 *  EmptyState
 * ------------------------------------------------------------------ */
export function EmptyState({
  icon: IconCmp,
  title,
  description,
  action,
  compact,
}: {
  icon: Icon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-8" : "py-14"
      }`}
    >
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-star/35">
        <IconCmp size={26} weight="duotone" />
      </span>
      <p className="text-[15px] font-medium text-star/80">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-star/45">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  TabBar
 * ------------------------------------------------------------------ */
export function TabBar({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: string; label: string; count?: number }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-white/10 pb-px">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`relative shrink-0 px-3.5 py-2.5 text-[14px] transition-colors ${
              active ? "font-semibold text-star" : "text-star/50 hover:text-star/80"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-[12px] text-star/40">({tab.count})</span>
            )}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-cosmic-blue to-cosmic-fuchsia" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Badge
 * ------------------------------------------------------------------ */
export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "border-white/15 bg-white/[0.06] text-star/70",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  info: "border-cosmic-violet/35 bg-cosmic-violet/10 text-cosmic-purple",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 *  Bảng dữ liệu tối giản — dùng chung cho các trang danh sách.
 * ------------------------------------------------------------------ */
export function DataTable({
  columns,
  children,
}: {
  columns: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
        <thead>
          <tr className="border-b border-white/10 text-left text-[12px] uppercase tracking-wider text-star/40">
            {columns.map((c) => (
              <th key={c} className="px-5 py-3 font-medium sm:px-6">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-5 py-3.5 align-middle sm:px-6 ${className}`}>{children}</td>;
}

/* ------------------------------------------------------------------ *
 *  Định dạng tiền VND.
 * ------------------------------------------------------------------ */
export function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}
