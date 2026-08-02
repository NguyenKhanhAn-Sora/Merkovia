"use client";

import { Planet, SignOut } from "@phosphor-icons/react";
import type { AdminUser } from "../../lib/session";

export default function Topbar({
  admin,
  onLogout,
}: {
  admin: AdminUser;
  onLogout: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[rgba(3,10,18,0.72)] backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Planet size={22} weight="duotone" className="text-cosmic-violet" />
          <span className="text-[15px] font-semibold tracking-[0.18em] text-star">
            MERKOVIA
          </span>
          <span className="rounded-full border border-cosmic-violet/40 bg-cosmic-violet/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cosmic-purple">
            Quản trị
          </span>
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
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  );
}
