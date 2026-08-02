"use client";

import Image from "next/image";
import GalaxyCanvas from "./GalaxyCanvas";
import { ArrowRight, LockKey, Planet, ShieldCheck, WarningCircle } from "@phosphor-icons/react";

const LOGO_MASK = "radial-gradient(ellipse 60% 62% at 50% 50%, #000 45%, transparent 76%)";

/* ------------------------------------------------------------------ *
 *  AuthShell — Milky-Way background + brand panel + right form column.
 *  Cùng khung với trang đăng nhập người bán, đổi nhãn/nội dung sang admin.
 * ------------------------------------------------------------------ */
export function AuthShell({
  heading,
  subheading,
  children,
}: {
  heading: React.ReactNode;
  subheading: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="relative min-h-[100dvh] w-full">
      <GalaxyCanvas />

      <div className="relative mx-auto grid w-full max-w-[1400px] lg:grid-cols-2">
        {/* Left: cosmic brand panel */}
        <section className="relative hidden overflow-hidden lg:flex lg:sticky lg:top-0 lg:h-[100dvh] lg:flex-col lg:justify-between lg:p-12 xl:p-16">
          <div className="relative flex items-center gap-3">
            <Planet size={26} weight="duotone" className="text-cosmic-violet" />
            <span className="text-lg font-semibold tracking-[0.2em] text-star">MERKOVIA</span>
            <span className="rounded-full border border-cosmic-violet/40 bg-cosmic-violet/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-cosmic-purple">
              Quản trị
            </span>
          </div>

          <div className="relative flex flex-1 items-center justify-center">
            <div
              className="absolute h-[26rem] w-[26rem] rounded-full border border-white/[0.04]"
              style={{ animation: "orbit-spin 44s linear infinite" }}
              aria-hidden
            >
              <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-cosmic-blue shadow-[0_0_16px_4px] shadow-cosmic-blue/70" />
            </div>
            <div className="relative w-full max-w-lg animate-float">
              <div className="absolute inset-0 -z-10 scale-90 rounded-full bg-cosmic-violet/25 blur-[90px]" aria-hidden />
              <Image
                src="/logo.png"
                alt="Merkovia"
                width={720}
                height={480}
                priority
                className="w-full object-contain"
                style={{ mixBlendMode: "screen", maskImage: LOGO_MASK, WebkitMaskImage: LOGO_MASK }}
              />
            </div>
          </div>

          <div className="relative max-w-md">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-star xl:text-4xl">
              {heading}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-star/55">{subheading}</p>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[13px] text-star/60">
              <span className="flex items-center gap-2">
                <ShieldCheck size={17} weight="regular" className="text-cosmic-violet" />
                Toàn quyền vận hành hệ thống
              </span>
              <span className="flex items-center gap-2">
                <LockKey size={17} weight="regular" className="text-cosmic-violet" />
                Phiên đăng nhập bảo mật, hết hạn nhanh
              </span>
            </div>
          </div>
        </section>

        {/* Right: form column */}
        <section className="relative">
          <div className="flex min-h-[100dvh] items-center justify-center px-5 py-10 sm:px-8">
            <div className="relative w-full max-w-[440px] animate-rise">
              <div className="mb-8 flex items-center justify-center gap-2 lg:hidden">
                <Image
                  src="/logo.png"
                  alt="Merkovia"
                  width={170}
                  height={113}
                  priority
                  className="h-11 w-auto object-contain"
                  style={{ mixBlendMode: "screen", maskImage: LOGO_MASK, WebkitMaskImage: LOGO_MASK }}
                />
                <span className="text-base font-semibold tracking-[0.2em] text-star">MERKOVIA</span>
                <span className="rounded-full border border-cosmic-violet/40 bg-cosmic-violet/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cosmic-purple">
                  Quản trị
                </span>
              </div>
              {children}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ *
 *  GlassCard — the double-bezel frosted panel that holds a form.
 * ------------------------------------------------------------------ */
export function GlassCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[calc(var(--radius-card)+0.375rem)] border border-white/10 bg-[rgba(4,14,22,0.6)] p-1.5 shadow-[0_40px_120px_-20px_rgba(14,165,233,0.35)] backdrop-blur-2xl">
      <div className="rounded-card bg-gradient-to-b from-white/[0.06] to-white/[0.015] p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:p-9">
        <header className="mb-7">
          <h1 className="text-2xl font-semibold tracking-tight text-star">{title}</h1>
          <p className="mt-1.5 text-[14px] text-star/55">{subtitle}</p>
        </header>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Field primitive — label above, icon inside, accent focus ring
 * ------------------------------------------------------------------ */
export function Field({
  id,
  label,
  icon,
  trailing,
  error,
  ...props
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const stateRing = error
    ? "border-rose-500/60 focus:border-rose-500/70 focus:ring-rose-500/15"
    : "border-white/10 focus:border-cosmic-violet/60 focus:ring-cosmic-violet/15";
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-medium text-star/70">
        {label}
      </label>
      <div className="group relative">
        <span
          className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${
            error ? "text-rose-400/70" : "text-star/40 group-focus-within:text-cosmic-violet"
          }`}
        >
          {icon}
        </span>
        <input
          id={id}
          aria-invalid={!!error}
          className={`h-12 w-full rounded-2xl border bg-white/[0.04] pl-12 pr-12 text-[15px] text-star placeholder:text-star/30 outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:bg-white/[0.06] focus:ring-4 ${stateRing}`}
          {...props}
        />
        {trailing && <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-[13px] text-rose-400">
          <WarningCircle size={15} weight="fill" className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  SubmitButton
 * ------------------------------------------------------------------ */
export function SubmitButton({
  children,
  disabled,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-cosmic-blue via-cosmic-violet to-cosmic-fuchsia pl-5 pr-2 text-[15px] font-semibold text-black/85 shadow-[0_12px_32px_-8px_rgba(14,165,233,0.5)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_16px_40px_-8px_rgba(45,212,191,0.6)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-full" />
      <span className="relative">{children}</span>
      <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 group-hover:-translate-y-[1px]">
        <ArrowRight size={16} weight="bold" />
      </span>
    </button>
  );
}
