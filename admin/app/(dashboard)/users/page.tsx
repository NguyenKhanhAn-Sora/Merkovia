"use client";

import { useCallback, useEffect, useState } from "react";
import { LockKey, LockKeyOpen, MagnifyingGlass } from "@phosphor-icons/react";
import {
  Badge,
  DataTable,
  GhostButton,
  Panel,
  PageHeader,
  TabBar,
  Td,
  type BadgeTone,
} from "../../../components/dashboard/ui";
import UserLockModal from "../../../components/dashboard/UserLockModal";
import {
  getUsers,
  type AdminUserListItem,
  type AdminUserListResult,
  type UserRole,
  type UserTab,
} from "../../../lib/users-api";

const ROLE_LABEL: Record<UserRole, string> = {
  buyer: "Người mua",
  seller: "Người bán",
  admin: "Quản trị",
};

const STATUS_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Đang hoạt động", tone: "success" },
  pending: { label: "Chờ xác thực", tone: "warning" },
  suspended: { label: "Đã khoá", tone: "danger" },
  deleted: { label: "Đã xoá", tone: "neutral" },
};

export default function UsersPage() {
  const [tab, setTab] = useState<UserTab>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AdminUserListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalUser, setModalUser] = useState<{ user: AdminUserListItem; mode: "lock" | "unlock" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getUsers({ tab, q, page, limit: 20 }));
    } finally {
      setLoading(false);
    }
  }, [tab, q, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const c = data?.counts;
  const tabs: { key: UserTab; label: string; count?: number }[] = [
    { key: "all", label: "Tất cả", count: c?.all },
    { key: "buyer", label: "Người mua", count: c?.buyer },
    { key: "seller", label: "Người bán", count: c?.seller },
    { key: "locked", label: "Bị khoá", count: c?.locked },
  ];

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div>
      <PageHeader
        title="Người dùng"
        description="Toàn bộ tài khoản người mua và người bán trên sàn."
        action={
          <div className="relative w-full max-w-xs">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-star/35"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm theo email, SĐT…"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-3 text-[13.5px] text-star outline-none transition-colors placeholder:text-star/35 focus:border-cosmic-violet/50"
            />
          </div>
        }
      />

      <Panel padded={false} className="overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <TabBar
            tabs={tabs}
            value={tab}
            onChange={(k) => {
              setTab(k as UserTab);
              setPage(1);
            }}
          />
        </div>

        {!loading && data && data.items.length === 0 ? (
          <p className="py-16 text-center text-[13.5px] text-star/40">Không có tài khoản nào ở mục này.</p>
        ) : (
          <DataTable columns={["Người dùng", "Liên hệ", "Vai trò", "Trạng thái", "Ngày tham gia", ""]}>
            {(data?.items ?? []).map((u) => {
              const badge = STATUS_BADGE[u.status] ?? STATUS_BADGE.active;
              return (
                <tr key={u.id}>
                  <Td className="font-medium text-star/85">
                    {u.name || "—"}
                    {u.shop && <span className="ml-1.5 text-star/40">({u.shop.name})</span>}
                  </Td>
                  <Td className="text-star/60">{u.email || u.phone || "—"}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1.5">
                      {u.roles
                        .filter((r) => r !== "admin")
                        .map((r) => (
                          <Badge key={r} tone="info">
                            {ROLE_LABEL[r]}
                          </Badge>
                        ))}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </Td>
                  <Td className="text-star/50">
                    {u.createdAt
                      ? new Date(u.createdAt).toLocaleDateString("vi-VN", { dateStyle: "short" })
                      : "—"}
                  </Td>
                  <Td>
                    {u.status === "suspended" ? (
                      <GhostButton
                        icon={LockKeyOpen}
                        onClick={() => setModalUser({ user: u, mode: "unlock" })}
                        className="h-9 px-3 text-[13px]"
                      >
                        Gỡ khoá
                      </GhostButton>
                    ) : (
                      <GhostButton
                        icon={LockKey}
                        onClick={() => setModalUser({ user: u, mode: "lock" })}
                        className="h-9 px-3 text-[13px] text-rose-300 hover:text-rose-200"
                      >
                        Khoá
                      </GhostButton>
                    )}
                  </Td>
                </tr>
              );
            })}
          </DataTable>
        )}

        {data && totalPages > 1 && (
          <div className="flex items-center justify-between gap-4 px-6 py-4">
            <span className="text-[13px] text-star/45">
              Trang {data.page}/{totalPages} — {data.total} tài khoản
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page <= 1}
                className="h-9 rounded-lg border border-white/10 px-3 text-[13px] text-star/70 transition-colors hover:border-white/25 disabled:opacity-35"
              >
                Trước
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={data.page >= totalPages}
                className="h-9 rounded-lg border border-white/10 px-3 text-[13px] text-star/70 transition-colors hover:border-white/25 disabled:opacity-35"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </Panel>

      {modalUser && (
        <UserLockModal
          user={modalUser.user}
          mode={modalUser.mode}
          onClose={() => setModalUser(null)}
          onDone={() => void load()}
        />
      )}
    </div>
  );
}
