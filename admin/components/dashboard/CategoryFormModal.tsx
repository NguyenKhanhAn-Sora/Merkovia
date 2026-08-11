"use client";

import { useState } from "react";
import { CircleNotch, X } from "@phosphor-icons/react";
import { createCategory, updateCategory, type AdminCategoryNode } from "../../lib/categories-api";

interface Props {
  /** Có `category` = sửa; không có = tạo mới. */
  category?: AdminCategoryNode;
  /** Chỉ dùng khi tạo mới danh mục con — id + tên ngành hàng cha để hiển thị. */
  parent?: { id: string; name: string };
  onClose: () => void;
  /**
   * Trả về dữ liệu vừa lưu để trang cha cập nhật THẲNG vào state cục bộ —
   * không cần tải lại cả cây. `id` chỉ có khi vừa TẠO MỚI (trang cha dùng để
   * phân biệt tạo/sửa mà không cần modal tự khai báo mode).
   */
  onSaved: (result: { id?: string; name: string; icon?: string }) => void;
}

/** Form tạo/sửa Ngành hàng gốc hoặc Danh mục con — cùng 1 modal vì trường giống hệt nhau. */
export default function CategoryFormModal({ category, parent, onClose, onSaved }: Props) {
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!category;
  const title = isEdit ? "Sửa danh mục" : parent ? `Thêm danh mục con — ${parent.name}` : "Thêm ngành hàng";

  async function submit() {
    if (name.trim().length < 1) {
      setError("Vui lòng nhập tên.");
      return;
    }
    setBusy(true);
    setError("");
    const trimmedName = name.trim();
    const trimmedIcon = icon.trim() || undefined;
    try {
      if (isEdit) {
        await updateCategory(category!.id, { name: trimmedName, icon: trimmedIcon });
        onSaved({ name: trimmedName, icon: trimmedIcon });
      } else {
        const res = await createCategory({ name: trimmedName, parentId: parent?.id, icon: trimmedIcon });
        onSaved({ id: res.id, name: trimmedName, icon: trimmedIcon });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-[420px] rounded-2xl border border-white/10 bg-[rgba(4,10,18,0.97)] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      >
        <button
          type="button"
          onClick={() => !busy && onClose()}
          aria-label="Đóng"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-star/45 transition-colors hover:bg-white/5 hover:text-star"
        >
          <X size={17} weight="bold" />
        </button>

        <h2 className="pr-8 text-[16px] font-semibold text-star">{title}</h2>

        <div className="mt-4 space-y-3.5">
          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-star/60">Tên</label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              maxLength={80}
              autoFocus
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[13.5px] text-star outline-none transition-colors placeholder:text-star/30 focus:border-cosmic-violet/50"
              placeholder="Vd: Thời trang nam"
            />
          </div>

          {!parent && (
            <div>
              <label className="mb-1.5 block text-[12.5px] font-medium text-star/60">
                Icon (Phosphor, tuỳ chọn)
              </label>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={60}
                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[13.5px] text-star outline-none transition-colors placeholder:text-star/30 focus:border-cosmic-violet/50"
                placeholder="Vd: TShirt"
              />
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[13px] text-rose-200">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[13.5px] font-medium text-star/70 transition-colors hover:border-white/20 hover:text-star disabled:opacity-45"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-cosmic-blue via-cosmic-violet to-cosmic-fuchsia px-5 text-[13.5px] font-semibold text-black/85 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy && <CircleNotch size={15} className="animate-spin" />}
            {busy ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}
