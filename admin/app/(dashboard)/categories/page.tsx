"use client";

import { FolderSimple, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { GhostButton, Panel, PageHeader, PreviewNote, PrimaryButton } from "../../../components/dashboard/ui";

interface Category {
  name: string;
  count: number;
  children?: { name: string; count: number }[];
}

const CATEGORIES: Category[] = [
  {
    name: "Đồ gia dụng",
    count: 214,
    children: [
      { name: "Đồ gốm sứ", count: 96 },
      { name: "Dụng cụ bếp", count: 118 },
    ],
  },
  {
    name: "Thời trang",
    count: 340,
    children: [
      { name: "Vải & lụa", count: 152 },
      { name: "Phụ kiện thủ công", count: 188 },
    ],
  },
  { name: "Thực phẩm", count: 176 },
  { name: "Trang trí nhà cửa", count: 98 },
  { name: "Đồ thủ công mỹ nghệ", count: 261 },
];

export default function CategoriesPage() {
  return (
    <div>
      <PageHeader
        title="Danh mục"
        description="Cây danh mục sản phẩm dùng chung cho toàn sàn."
        action={
          <PrimaryButton icon={Plus} disabled>
            Thêm danh mục
          </PrimaryButton>
        }
      />
      <PreviewNote />

      <Panel>
        <ul className="flex flex-col divide-y divide-white/[0.06]">
          {CATEGORIES.map((c) => (
            <li key={c.name} className="py-1">
              <div className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-white/[0.03]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-cosmic-violet">
                  <FolderSimple size={17} weight="duotone" />
                </span>
                <span className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-star/85">{c.name}</p>
                  <p className="text-[12px] text-star/40">{c.count} sản phẩm</p>
                </span>
                <span className="flex gap-1">
                  <GhostButton icon={PencilSimple} disabled className="h-9 w-9 px-0" />
                  <GhostButton icon={Trash} disabled className="h-9 w-9 px-0" />
                </span>
              </div>
              {c.children && (
                <ul className="ml-6 flex flex-col border-l border-white/[0.07] pl-4">
                  {c.children.map((child) => (
                    <li key={child.name} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.03]">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-star/20" />
                      <span className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] text-star/70">{child.name}</p>
                      </span>
                      <span className="text-[12px] text-star/35">{child.count} sản phẩm</span>
                      <span className="flex gap-1">
                        <GhostButton icon={PencilSimple} disabled className="h-8 w-8 px-0" />
                        <GhostButton icon={Trash} disabled className="h-8 w-8 px-0" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
