"use client";

import { useState } from "react";
import { Eye, MagnifyingGlass } from "@phosphor-icons/react";
import {
  Badge,
  DataTable,
  GhostButton,
  Panel,
  PageHeader,
  PreviewNote,
  TabBar,
  Td,
} from "../../../components/dashboard/ui";

interface Row {
  name: string;
  contact: string;
  roles: ("buyer" | "seller")[];
  status: "active" | "suspended";
  joined: string;
}

const USERS: Row[] = [
  { name: "Trần Minh An", contact: "an.tran@gmail.com", roles: ["buyer"], status: "active", joined: "12/03/2026" },
  { name: "Dao Thái Hoà (Shop)", contact: "hoa.dao@gmail.com", roles: ["seller"], status: "active", joined: "02/01/2026" },
  { name: "Nguyễn Thu Hà", contact: "ha.nguyen@gmail.com", roles: ["buyer", "seller"], status: "active", joined: "28/11/2025" },
  { name: "Lê Quốc Bảo", contact: "0912 345 678", roles: ["buyer"], status: "suspended", joined: "19/09/2025" },
  { name: "Phạm Gia Hân", contact: "han.pham@gmail.com", roles: ["buyer"], status: "active", joined: "05/08/2025" },
  { name: "Đỗ Anh Tuấn", contact: "0987 654 321", roles: ["buyer"], status: "active", joined: "14/06/2025" },
];

const TABS = [
  { key: "all", label: "Tất cả", count: USERS.length },
  { key: "buyer", label: "Người mua", count: USERS.filter((u) => u.roles.includes("buyer")).length },
  { key: "seller", label: "Người bán", count: USERS.filter((u) => u.roles.includes("seller")).length },
  { key: "suspended", label: "Bị khoá", count: USERS.filter((u) => u.status === "suspended").length },
];

const ROLE_LABEL: Record<"buyer" | "seller", string> = { buyer: "Người mua", seller: "Người bán" };

export default function UsersPage() {
  const [tab, setTab] = useState("all");
  const rows = USERS.filter((u) => {
    if (tab === "all") return true;
    if (tab === "suspended") return u.status === "suspended";
    return u.roles.includes(tab as "buyer" | "seller");
  });

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
              disabled
              placeholder="Tìm theo tên, email, SĐT…"
              className="h-11 w-full cursor-not-allowed rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-3 text-[13.5px] text-star/40 outline-none"
            />
          </div>
        }
      />
      <PreviewNote />

      <Panel padded={false} className="overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <TabBar tabs={TABS} value={tab} onChange={setTab} />
        </div>
        <DataTable columns={["Người dùng", "Liên hệ", "Vai trò", "Trạng thái", "Ngày tham gia", ""]}>
          {rows.map((u) => (
            <tr key={u.name}>
              <Td className="font-medium text-star/85">{u.name}</Td>
              <Td className="text-star/60">{u.contact}</Td>
              <Td>
                <span className="flex flex-wrap gap-1.5">
                  {u.roles.map((r) => (
                    <Badge key={r} tone="info">
                      {ROLE_LABEL[r]}
                    </Badge>
                  ))}
                </span>
              </Td>
              <Td>
                <Badge tone={u.status === "active" ? "success" : "danger"}>
                  {u.status === "active" ? "Đang hoạt động" : "Đã khoá"}
                </Badge>
              </Td>
              <Td className="text-star/50">{u.joined}</Td>
              <Td>
                <GhostButton icon={Eye} disabled className="h-9 px-3 text-[13px]">
                  Chi tiết
                </GhostButton>
              </Td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
}
