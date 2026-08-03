"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Planet, ShieldCheck, SignOut, X } from "@phosphor-icons/react";
import { NAV_GROUPS, NAV_ITEMS, isActive } from "./nav";
import type { AdminUser } from "../../lib/session";

function AdminIdentity({ admin }: { admin: AdminUser }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cosmic-blue to-cosmic-fuchsia text-white">
        <ShieldCheck size={20} weight="fill" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-star">Quản trị viên</p>
        <p className="truncate text-[12px] text-star/45">{admin.email}</p>
      </div>
    </div>
  );
}

/**
 * Sidebar điều hướng. Trên desktop cố định bên trái; trên mobile trượt ra
 * dạng drawer (điều khiển bằng `open`/`onClose` từ layout).
 */
export default function Sidebar({
  admin,
  open,
  onClose,
  onLogout,
}: {
  admin: AdminUser;
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();

  const content = (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-6">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2.5">
          <Planet size={22} weight="duotone" className="text-cosmic-violet" />
          <span className="text-[15px] font-semibold tracking-[0.18em] text-star">
            MERKOVIA
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng menu"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-star/50 hover:bg-white/5 hover:text-star lg:hidden"
        >
          <X size={18} weight="bold" />
        </button>
      </div>

      <AdminIdentity admin={admin} />

      <nav className="flex flex-1 flex-col gap-6">
        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter((i) => i.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-star/35">
                {group}
              </p>
              <ul className="flex flex-col gap-1">
                {items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const ItemIcon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-all duration-300 ${
                          active
                            ? "bg-gradient-to-r from-cosmic-violet/20 to-transparent font-semibold text-star"
                            : "text-star/60 hover:bg-white/[0.04] hover:text-star/90"
                        }`}
                      >
                        {active && (
                          <span
                            className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gradient-to-b from-cosmic-blue to-cosmic-fuchsia"
                            aria-hidden
                          />
                        )}
                        <ItemIcon
                          size={19}
                          weight={active ? "duotone" : "regular"}
                          className={active ? "text-cosmic-violet" : ""}
                        />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={onLogout}
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] text-star/55 transition-colors hover:bg-white/[0.04] hover:text-star/90"
      >
        <SignOut size={19} weight="regular" />
        Đăng xuất
      </button>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-white/10 bg-[rgba(3,10,18,0.72)] backdrop-blur-xl lg:block">
        {content}
      </aside>

      <div
        className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        <div
          onClick={onClose}
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          className={`absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r border-white/10 bg-[rgba(3,10,18,0.95)] backdrop-blur-xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {content}
        </aside>
      </div>
    </>
  );
}
