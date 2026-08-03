"use client";

import { List, MagnifyingGlass, SignOut } from "@phosphor-icons/react";
import type { AdminUser } from "../../lib/session";

export default function Topbar({
  admin,
  onOpenMenu,
  onLogout,
}: {
  admin: AdminUser;
  onOpenMenu: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[rgba(3,10,18,0.72)] backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Mở menu"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-star/70 hover:text-star lg:hidden"
        >
          <List size={19} weight="bold" />
        </button>

        {/* Tìm kiếm — sẽ nối vào dữ liệu khi các trang có API thật. */}
        <div className="relative hidden flex-1 sm:block sm:max-w-md">
          <MagnifyingGlass
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-star/35"
          />
          <input
            type="search"
            disabled
            placeholder="Tìm người dùng, gian hàng, đơn hàng… (sắp ra mắt)"
            aria-label="Tìm kiếm"
            className="h-10 w-full cursor-not-allowed rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-3 text-[13.5px] text-star/40 placeholder:text-star/30 outline-none"
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden max-w-[220px] truncate text-[13px] text-star/60 sm:block">
            {admin.email}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[13.5px] font-medium text-star/75 transition-colors hover:border-white/20 hover:text-star"
          >
            <SignOut size={17} />
            <span className="hidden sm:inline">Đăng xuất</span>
          </button>
        </div>
      </div>
    </header>
  );
}
