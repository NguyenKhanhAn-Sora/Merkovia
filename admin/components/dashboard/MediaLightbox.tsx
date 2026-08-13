"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";

export interface LightboxItem {
  kind: "image" | "video";
  url: string;
}

/**
 * Xem ảnh/video đính kèm đánh giá toàn màn hình — thay cho mở tab mới, vốn lộ
 * thẳng URL lưu trữ (R2) lên thanh địa chỉ trình duyệt.
 *
 * Render qua PORTAL thẳng vào `document.body`: modal kiểm duyệt bọc ngoài dùng
 * `backdrop-blur`, khiến `position: fixed` bên trong bị nhốt trong khung modal
 * thay vì phủ hết màn hình nếu không thoát ra bằng portal.
 */
export default function MediaLightbox({
  items,
  index,
  onClose,
  onIndexChange,
}: {
  items: LightboxItem[];
  /** Ảnh đang xem; `null` = đóng. */
  index: number | null;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}) {
  const open = index !== null;
  const count = items.length;

  const go = useCallback(
    (step: number) => {
      if (index === null || count === 0) return;
      onIndexChange((index + step + count) % count);
    },
    [index, count, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, go]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || count === 0 || !mounted) return null;
  const item = items[index];
  if (!item) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex flex-col bg-black/92 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh/video đánh giá"
    >
      <header className="flex shrink-0 items-center justify-between px-4 py-3">
        <span className="text-[13px] font-medium text-white/60">
          {index + 1} / {count}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={20} weight="bold" />
        </button>
      </header>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-4"
        onClick={onClose}
      >
        {count > 1 && <ArrowButton side="left" onClick={() => go(-1)} />}

        <div
          className="flex max-h-full max-w-full items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {item.kind === "video" ? (
            <video
              key={item.url}
              src={item.url}
              controls
              autoPlay
              playsInline
              className="max-h-[78vh] max-w-full rounded-lg"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={item.url}
              src={item.url}
              alt=""
              className="max-h-[78vh] max-w-full rounded-lg object-contain"
            />
          )}
        </div>

        {count > 1 && <ArrowButton side="right" onClick={() => go(1)} />}
      </div>

      {count > 1 && (
        <div
          className="flex shrink-0 justify-center gap-2 overflow-x-auto px-4 pb-5"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((m, i) => (
            <button
              key={`${m.url}-${i}`}
              type="button"
              onClick={() => onIndexChange(i)}
              aria-label={`Xem ${m.kind === "video" ? "video" : "ảnh"} ${i + 1}`}
              aria-current={i === index}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                i === index
                  ? "border-cosmic-fuchsia"
                  : "border-transparent opacity-50 hover:opacity-90"
              }`}
            >
              {m.kind === "video" ? (
                <video src={m.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

function ArrowButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? CaretLeft : CaretRight;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={side === "left" ? "Ảnh trước" : "Ảnh tiếp theo"}
      className={`absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur transition-colors hover:bg-black/70 hover:text-white ${
        side === "left" ? "left-2 sm:left-5" : "right-2 sm:right-5"
      }`}
    >
      <Icon size={22} weight="bold" />
    </button>
  );
}
