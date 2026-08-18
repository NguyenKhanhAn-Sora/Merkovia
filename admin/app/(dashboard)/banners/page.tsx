"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleNotch,
  DotsSixVertical,
  Eye,
  EyeSlash,
  Image as ImageIcon,
  PencilSimple,
  Plus,
  Trash,
  type Icon,
} from "@phosphor-icons/react";
import { Badge, Panel, PageHeader, PrimaryButton } from "../../../components/dashboard/ui";
import BannerFormModal from "../../../components/dashboard/BannerFormModal";
import ConfirmDialog from "../../../components/dashboard/ConfirmDialog";
import {
  deleteBanner,
  getBanners,
  reorderBanners,
  setBannerVisibility,
  type AdminBanner,
} from "../../../lib/banners-api";

type ModalState = { mode: "create" } | { mode: "edit"; banner: AdminBanner } | null;
type DeleteState = { id: string; label: string } | null;
type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 2000;

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

export default function BannersPage() {
  const [banners, setBanners] = useState<AdminBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  const [modal, setModal] = useState<ModalState>(null);
  const [toDelete, setToDelete] = useState<DeleteState>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const pendingSaveRef = useRef<string[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setBanners(await getBanners());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Không tải được banner.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingSaveRef.current) {
        void reorderBanners(pendingSaveRef.current);
      }
    };
  }, []);

  async function flushSave() {
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    setSaveStatus("saving");
    try {
      await reorderBanners(pending);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch (e) {
      setSaveStatus("error");
      setActionError(e instanceof Error ? e.message : "Không lưu được thứ tự — đang tải lại.");
      await load();
    }
  }

  function scheduleSave(orderedIds: string[]) {
    pendingSaveRef.current = orderedIds;
    setSaveStatus("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS);
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = reorderById(banners, dragId, targetId);
    setBanners(next);
    scheduleSave(next.map((b) => b.id));
  }

  async function toggleVisibility(banner: AdminBanner) {
    const nextActive = !banner.isActive;
    const snapshot = banners;
    setBanners((prev) => prev.map((b) => (b.id === banner.id ? { ...b, isActive: nextActive } : b)));
    setBusyId(banner.id);
    setActionError("");
    try {
      await setBannerVisibility(banner.id, nextActive);
    } catch (e) {
      setBanners(snapshot);
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
      await deleteBanner(toDelete.id);
      setBanners((prev) => prev.filter((b) => b.id !== toDelete.id));
      setToDelete(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Không xoá được.");
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
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
        title="Banner trang chủ"
        description="Carousel quảng cáo hiển thị đầu trang chủ người mua. Kéo-thả để sắp xếp, tự lưu sau 2 giây."
        action={
          <PrimaryButton icon={Plus} onClick={() => setModal({ mode: "create" })}>
            Thêm banner
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
        ) : banners.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-star/40">
            <ImageIcon size={28} />
            <p className="text-[13.5px]">Chưa có banner nào.</p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-white/[0.06]">
            {banners.map((b) => {
              const isBusy = busyId === b.id;
              const isDragOver = dragOverId === b.id && dragId !== null && dragId !== b.id;
              return (
                <li
                  key={b.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    setDragId(b.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverId(b.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(b.id);
                  }}
                  className={`flex cursor-grab items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.03] active:cursor-grabbing ${
                    dragId === b.id ? "opacity-40" : ""
                  } ${isDragOver ? "ring-1 ring-inset ring-cosmic-violet/50" : ""}`}
                >
                  <DotsSixVertical size={14} className="shrink-0 text-star/25" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={b.imageUrl}
                    alt=""
                    draggable={false}
                    className="h-12 w-20 shrink-0 rounded-lg border border-white/10 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[13.5px] font-medium text-star/85">{b.label}</p>
                      {!b.isActive && <Badge tone="neutral">Đang tắt</Badge>}
                    </span>
                    <p className="truncate text-[12px] text-star/40">
                      {b.link || "Không có đường dẫn"}
                    </p>
                  </div>
                  <span draggable={false} className="flex shrink-0 gap-1">
                    <IconActionButton
                      icon={b.isActive ? EyeSlash : Eye}
                      label={b.isActive ? "Tắt banner" : "Bật banner"}
                      onClick={() => void toggleVisibility(b)}
                      disabled={isBusy}
                    />
                    <IconActionButton
                      icon={PencilSimple}
                      label="Sửa banner"
                      onClick={() => setModal({ mode: "edit", banner: b })}
                    />
                    <IconActionButton
                      icon={Trash}
                      label="Xoá"
                      onClick={() => setToDelete({ id: b.id, label: b.label })}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {modal?.mode === "create" && (
        <BannerFormModal
          onClose={() => setModal(null)}
          // Tải lại danh sách thay vì tự vá state cục bộ — ảnh gốc/thông số
          // crop vừa lưu không có sẵn ở đây, tải lại đảm bảo `edit` mở lại
          // đúng ảnh gốc để chỉnh crop tiếp thay vì thiếu dữ liệu.
          onSaved={() => void load()}
        />
      )}
      {modal?.mode === "edit" && (
        <BannerFormModal
          banner={modal.banner}
          onClose={() => setModal(null)}
          onSaved={() => void load()}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title={`Xoá banner "${toDelete?.label ?? ""}"?`}
        description="Ảnh sẽ bị xoá khỏi kho lưu trữ. Hành động này không hoàn tác được."
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
