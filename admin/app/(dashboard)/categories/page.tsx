"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CaretRight,
  CircleNotch,
  DotsSixVertical,
  Eye,
  EyeSlash,
  FolderSimple,
  PencilSimple,
  Plus,
  Trash,
  Warning,
  type Icon,
} from "@phosphor-icons/react";
import { Badge, Panel, PageHeader, PrimaryButton } from "../../../components/dashboard/ui";
import CategoryFormModal from "../../../components/dashboard/CategoryFormModal";
import ConfirmDialog from "../../../components/dashboard/ConfirmDialog";
import {
  deleteCategory,
  getCategoryTree,
  reorderCategories,
  setCategoryVisibility,
  type AdminCategoryNode,
} from "../../../lib/categories-api";

type ModalState =
  | { mode: "create-root" }
  | { mode: "create-child"; parent: { id: string; name: string } }
  | { mode: "edit"; category: AdminCategoryNode }
  | null;

type DeleteState = { id: string; name: string } | null;
type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 2000;

/**
 * Nút hành động chỉ có icon (ô vuông) — viết riêng thay vì tái dùng
 * `GhostButton` với `className="h-8 w-8 px-0"`: `GhostButton` có sẵn `px-4`
 * trong class gốc, ghép chuỗi với `px-0` truyền vào tạo ra HAI class cùng
 * thuộc tính padding — Tailwind không đảm bảo class nào "thắng" theo thứ tự
 * xuất hiện trong chuỗi, nên nếu `px-4` thắng thì một nút rộng 32px bị chiếm
 * hết bởi padding 16px mỗi bên, ép icon co lại gần như biến mất (đây chính là
 * lỗi "ô vuông trống" người dùng báo). Component này không kế thừa base class
 * nào nên không có xung đột. Cũng nhân tiện thêm `title` để hover thấy chú
 * thích — `GhostButton` không nhận `aria-label` (không có trong prop type) nên
 * trước đây gắn vào cũng bị bỏ qua âm thầm.
 */
function IconActionButton({
  icon: IconCmp,
  label,
  onClick,
  disabled,
}: {
  icon: Icon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-star/70 transition-colors hover:border-white/20 hover:text-star active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <IconCmp size={15} weight="regular" />
    </button>
  );
}

/** Kéo `draggedId` tới vị trí của `targetId` trong mảng — chèn TRƯỚC target. */
function reorderById<T extends { id: string }>(arr: T[], draggedId: string, targetId: string): T[] {
  const from = arr.findIndex((x) => x.id === draggedId);
  if (from === -1 || draggedId === targetId) return arr;
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  const to = copy.findIndex((x) => x.id === targetId);
  copy.splice(to === -1 ? copy.length : to, 0, item);
  return copy;
}

/**
 * Các hàm cập nhật CỤC BỘ cho `tree` — thay cho gọi lại `getCategoryTree()`
 * sau mỗi thao tác. Refetch toàn cây sau MỖI cú bấm ẩn/hiện/sửa/xoá chỉ chấp
 * nhận được khi cây còn nhỏ; khi hệ thống lớn (nhiều ngành hàng/danh mục),
 * chờ tải lại cả cây mỗi lần bấm sẽ chậm rõ rệt so với việc chỉ sửa đúng một
 * node đang đổi trong state có sẵn. Các hàm dưới đây MÔ PHỎNG lại đúng hệ quả
 * mà backend đã áp dụng (cascade tắt con khi tắt ngành hàng, tính lại
 * `hasNoActiveChildren`…) để state cục bộ luôn khớp với DB.
 */
function withVisibility(tree: AdminCategoryNode[], id: string, isActive: boolean): AdminCategoryNode[] {
  return tree.map((root) => {
    if (root.id === id) {
      // Tắt ngành hàng gốc → cascade tắt luôn mọi danh mục con (khớp
      // `adminSetVisibility` phía backend). Bật lại thì KHÔNG cascade ngược.
      const children = isActive ? root.children : root.children.map((c) => ({ ...c, isActive: false }));
      return { ...root, isActive, children, hasNoActiveChildren: !children.some((c) => c.isActive) };
    }
    if (!root.children.some((c) => c.id === id)) return root;
    const children = root.children.map((c) => (c.id === id ? { ...c, isActive } : c));
    return { ...root, children, hasNoActiveChildren: !children.some((c) => c.isActive) };
  });
}

function withRemoved(tree: AdminCategoryNode[], id: string): AdminCategoryNode[] {
  return tree
    .filter((root) => root.id !== id)
    .map((root) => {
      const children = root.children.filter((c) => c.id !== id);
      return { ...root, children, hasNoActiveChildren: !children.some((c) => c.isActive) };
    });
}

function withPatch(tree: AdminCategoryNode[], id: string, patch: { name: string; icon?: string }): AdminCategoryNode[] {
  return tree.map((root) => {
    if (root.id === id) return { ...root, ...patch };
    const idx = root.children.findIndex((c) => c.id === id);
    if (idx === -1) return root;
    return { ...root, children: root.children.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
  });
}

function withNewRoot(tree: AdminCategoryNode[], id: string, name: string, icon?: string): AdminCategoryNode[] {
  return [
    ...tree,
    { id, name, slug: "", icon, order: tree.length, isActive: true, productCount: 0, children: [], hasNoActiveChildren: true },
  ];
}

function withNewChild(tree: AdminCategoryNode[], parentId: string, id: string, name: string, icon?: string): AdminCategoryNode[] {
  return tree.map((root) => {
    if (root.id !== parentId) return root;
    const children = [
      ...root.children,
      { id, name, slug: "", icon, order: root.children.length, isActive: true, productCount: 0, children: [] },
    ];
    return { ...root, children, hasNoActiveChildren: !children.some((c) => c.isActive) };
  });
}

export default function CategoriesPage() {
  const [tree, setTree] = useState<AdminCategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [modal, setModal] = useState<ModalState>(null);
  const [toDelete, setToDelete] = useState<DeleteState>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [dragCtx, setDragCtx] = useState<{ listKey: string; id: string } | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const pendingSaveRef = useRef<{ parentId: string | undefined; orderedIds: string[] } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setTree(await getCategoryTree());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Không tải được danh mục.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Nếu rời trang khi vẫn còn thay đổi thứ tự chưa kịp lưu (trong 2s debounce),
  // bắn nốt request đó ngay — không chờ hết hạn nữa, kẻo mất thao tác vừa kéo.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingSaveRef.current) {
        void reorderCategories(pendingSaveRef.current.parentId, pendingSaveRef.current.orderedIds);
      }
    };
  }, []);

  async function flushSave() {
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    setSaveStatus("saving");
    try {
      await reorderCategories(pending.parentId, pending.orderedIds);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch (e) {
      setSaveStatus("error");
      setActionError(e instanceof Error ? e.message : "Không lưu được thứ tự — đang tải lại danh mục.");
      await load();
    }
  }

  function scheduleSave(parentId: string | undefined, orderedIds: string[]) {
    pendingSaveRef.current = { parentId, orderedIds };
    setSaveStatus("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS);
  }

  function handleDrop(listKey: string, parentId: string | undefined, targetId: string) {
    if (!dragCtx || dragCtx.listKey !== listKey || dragCtx.id === targetId) return;
    const draggedId = dragCtx.id;

    if (listKey === "root") {
      const next = reorderById(tree, draggedId, targetId);
      setTree(next);
      scheduleSave(undefined, next.map((n) => n.id));
    } else {
      const next = tree.map((root) =>
        root.id === listKey ? { ...root, children: reorderById(root.children, draggedId, targetId) } : root,
      );
      setTree(next);
      const parent = next.find((r) => r.id === listKey);
      if (parent) scheduleSave(parentId, parent.children.map((c) => c.id));
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleVisibility(node: AdminCategoryNode) {
    const nextActive = !node.isActive;
    const snapshot = tree;
    // Cập nhật NGAY, không chờ server — cảm giác tức thời. Nếu request thất
    // bại (vd bật con khi ngành hàng cha vẫn đang tắt), lùi lại đúng state cũ.
    setTree((prev) => withVisibility(prev, node.id, nextActive));
    setBusyId(node.id);
    setActionError("");
    try {
      await setCategoryVisibility(node.id, nextActive);
    } catch (e) {
      setTree(snapshot);
      setActionError(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setActionError("");
    try {
      await deleteCategory(toDelete.id);
      // Xoá hay bị chặn (còn con/sản phẩm) nên KHÔNG xoá lạc quan trước khi
      // biết kết quả — chỉ cập nhật cục bộ SAU KHI server xác nhận thành công.
      setTree((prev) => withRemoved(prev, toDelete.id));
      setToDelete(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Không xoá được.");
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  function renderRow(node: AdminCategoryNode, listKey: string, parentId: string | undefined, depth: 0 | 1) {
    const isBusy = busyId === node.id;
    const isDragOver = dragOverId === node.id && dragCtx?.listKey === listKey && dragCtx.id !== node.id;
    const isExpanded = depth === 0 && expanded.has(node.id);

    return (
      <div
        key={node.id}
        onDragOver={(e) => {
          if (dragCtx?.listKey === listKey) {
            e.preventDefault();
            if (dragOverId !== node.id) setDragOverId(node.id);
          }
        }}
        onDragLeave={() => setDragOverId((id) => (id === node.id ? null : id))}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverId(null);
          handleDrop(listKey, parentId, node.id);
        }}
        className={`flex items-center gap-1.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.03] ${
          depth === 1 ? "ml-6 border-l border-white/[0.07] pl-4" : ""
        } ${isDragOver ? "ring-1 ring-inset ring-cosmic-violet/50" : ""}`}
      >
        {depth === 0 && (
          <button
            type="button"
            onClick={() => toggleExpand(node.id)}
            aria-label={isExpanded ? "Thu gọn" : "Mở rộng"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-star/45 transition-transform hover:text-star"
          >
            <CaretRight size={14} weight="bold" className={isExpanded ? "rotate-90 transition-transform" : "transition-transform"} />
          </button>
        )}

        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            setDragCtx({ listKey, id: node.id });
          }}
          onDragEnd={() => {
            setDragCtx(null);
            setDragOverId(null);
          }}
          className={`flex min-w-0 flex-1 cursor-grab items-center gap-3 rounded-lg px-1 py-0.5 active:cursor-grabbing ${
            dragCtx?.id === node.id ? "opacity-40" : ""
          }`}
        >
          <DotsSixVertical size={14} className="shrink-0 text-star/25" />
          {depth === 0 ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-cosmic-violet">
              <FolderSimple size={17} weight="duotone" />
            </span>
          ) : (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-star/20" />
          )}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <p
                className={`truncate font-medium text-star/85 ${depth === 0 ? "text-[14px]" : "text-[13.5px] font-normal text-star/70"}`}
              >
                {node.name}
              </p>
              {!node.isActive && <Badge tone="neutral">Đang ẩn</Badge>}
              {depth === 0 && node.isActive && node.hasNoActiveChildren && (
                <span className="inline-flex items-center gap-1 text-[11.5px] text-amber-300">
                  <Warning size={12} weight="fill" />
                  Chưa có danh mục con đang bật
                </span>
              )}
            </span>
            <p className="text-[12px] text-star/40">{node.productCount} sản phẩm</p>
          </span>
        </div>

        <span draggable={false} className="flex shrink-0 gap-1">
          {depth === 0 && (
            <IconActionButton
              icon={Plus}
              label="Thêm danh mục con"
              onClick={() => setModal({ mode: "create-child", parent: { id: node.id, name: node.name } })}
            />
          )}
          <IconActionButton
            icon={node.isActive ? EyeSlash : Eye}
            label={node.isActive ? "Tắt hiển thị" : "Bật hiển thị"}
            onClick={() => void toggleVisibility(node)}
            disabled={isBusy}
          />
          <IconActionButton
            icon={PencilSimple}
            label="Sửa tên/icon"
            onClick={() => setModal({ mode: "edit", category: node })}
          />
          <IconActionButton
            icon={Trash}
            label="Xoá"
            onClick={() => setToDelete({ id: node.id, name: node.name })}
          />
        </span>
      </div>
    );
  }

  const SAVE_LABEL: Record<SaveStatus, string> = {
    idle: "",
    pending: "Đang chờ lưu…",
    saving: "Đang lưu…",
    saved: "Đã lưu",
    error: "Lưu thất bại",
  };

  return (
    <div>
      <PageHeader
        title="Danh mục"
        description="Cây danh mục 2 cấp dùng chung cho toàn sàn — Ngành hàng → Danh mục. Kéo-thả để sắp xếp, tự lưu sau 2 giây."
        action={
          <PrimaryButton icon={Plus} onClick={() => setModal({ mode: "create-root" })}>
            Thêm ngành hàng
          </PrimaryButton>
        }
      />

      {saveStatus !== "idle" && (
        <p
          className={`mb-3 flex items-center gap-1.5 text-[12.5px] ${
            saveStatus === "error" ? "text-rose-300" : "text-star/45"
          }`}
        >
          {saveStatus === "saving" && <CircleNotch size={12} className="animate-spin" />}
          {SAVE_LABEL[saveStatus]}
        </p>
      )}

      {actionError && (
        <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13.5px] text-rose-200">
          {actionError}
        </p>
      )}

      <Panel>
        {loading ? (
          <div className="flex justify-center py-10">
            <CircleNotch size={22} className="animate-spin text-star/40" />
          </div>
        ) : loadError ? (
          <p className="text-[13.5px] text-rose-300">{loadError}</p>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-star/40">
            <FolderSimple size={28} />
            <p className="text-[13.5px]">Chưa có ngành hàng nào.</p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-white/[0.06]">
            {tree.map((root) => (
              <li key={root.id} className="py-1">
                {renderRow(root, "root", undefined, 0)}
                {expanded.has(root.id) && root.children.length > 0 && (
                  <div className="flex flex-col">
                    {root.children.map((child) => renderRow(child, root.id, root.id, 1))}
                  </div>
                )}
                {expanded.has(root.id) && root.children.length === 0 && (
                  <p className="ml-6 border-l border-white/[0.07] py-2 pl-4 text-[12.5px] text-star/35">
                    Chưa có danh mục con.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {modal?.mode === "create-root" && (
        <CategoryFormModal
          onClose={() => setModal(null)}
          onSaved={(r) => r.id && setTree((prev) => withNewRoot(prev, r.id!, r.name, r.icon))}
        />
      )}
      {modal?.mode === "create-child" && (
        <CategoryFormModal
          parent={modal.parent}
          onClose={() => setModal(null)}
          onSaved={(r) => {
            if (!r.id) return;
            setTree((prev) => withNewChild(prev, modal.parent.id, r.id!, r.name, r.icon));
            // Mở luôn ngành hàng cha để thấy ngay danh mục con vừa thêm.
            setExpanded((prev) => new Set(prev).add(modal.parent.id));
          }}
        />
      )}
      {modal?.mode === "edit" && (
        <CategoryFormModal
          category={modal.category}
          onClose={() => setModal(null)}
          onSaved={(r) => setTree((prev) => withPatch(prev, modal.category.id, { name: r.name, icon: r.icon }))}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title={`Xoá "${toDelete?.name ?? ""}"?`}
        description="Chỉ xoá được khi danh mục không còn danh mục con hoặc sản phẩm nào tham chiếu tới. Nếu vẫn còn, hãy dùng nút ẩn thay vì xoá."
        confirmLabel="Xoá"
        tone="danger"
        icon={Trash}
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}
