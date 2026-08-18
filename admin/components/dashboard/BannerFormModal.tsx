"use client";

import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import {
  CircleNotch,
  Info,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { dataUrlToBlob, getCroppedBlob } from "../../lib/crop";
import {
  createBanner,
  updateBanner,
  uploadBannerImage,
  type AdminBanner,
} from "../../lib/banners-api";

interface Props {
  /** Có `banner` = sửa (đổi ảnh là TUỲ CHỌN); không có = thêm mới (bắt buộc cắt ảnh). */
  banner?: AdminBanner;
  onClose: () => void;
  onSaved: (result: { id?: string; label: string; imageUrl?: string; link?: string }) => void;
}

/** Tỉ lệ khung hiển thị THẬT trên trang chủ buyer — phải khớp với `HeroCarousel.tsx` (aspect-16/5). */
const ASPECT = 16 / 5;
const OUTPUT_WIDTH = 1600;
const OUTPUT_HEIGHT = 500;
const MAX_MB = 10;

/**
 * Form thêm/sửa banner — chọn ảnh gốc bất kỳ tỉ lệ nào, admin tự kéo/phóng để
 * chọn đúng phần hiển thị trong khung 16:5, xem trước CHÍNH XÁC như buyer sẽ
 * thấy. Lưu 2 ảnh (giống cơ chế đổi logo shop): ảnh đã cắt (hiển thị thật) +
 * ảnh gốc (để lần sau chỉnh crop lại không phải tải file mới).
 */
export default function BannerFormModal({ banner, onClose, onSaved }: Props) {
  const isEdit = !!banner;
  const [label, setLabel] = useState(banner?.label ?? "");
  const [link, setLink] = useState(banner?.link ?? "");

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Chỉ nhận tệp ảnh (PNG/JPG/WebP).");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Ảnh gốc tối đa ${MAX_MB}MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedArea(null);
    };
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (label.trim().length < 1) {
      setError("Vui lòng nhập nhãn banner.");
      return;
    }
    if (!isEdit && (!imageSrc || !croppedArea)) {
      setError("Vui lòng chọn và cắt ảnh banner trước.");
      return;
    }
    setBusy(true);
    setError("");
    const trimmedLabel = label.trim();
    const trimmedLink = link.trim() || undefined;
    try {
      let imageSet:
        | { imageUrl: string; imageKey: string; imageOriginalUrl: string; imageOriginalKey: string; crop: Record<string, unknown> }
        | undefined;
      // Có ảnh mới đang chờ cắt (bắt buộc lúc thêm mới, tuỳ chọn lúc sửa) →
      // tải song song bản đã cắt (hiển thị thật) và bản gốc (để sửa crop sau).
      if (imageSrc && croppedArea) {
        const originalBlob = dataUrlToBlob(imageSrc);
        const [cropped, original] = await Promise.all([
          getCroppedBlob(imageSrc, croppedArea, OUTPUT_WIDTH, OUTPUT_HEIGHT).then((b) =>
            uploadBannerImage(new File([b], "banner.jpg", { type: "image/jpeg" })),
          ),
          uploadBannerImage(
            new File([originalBlob], "banner-original.jpg", {
              type: originalBlob.type || "image/jpeg",
            }),
          ),
        ]);
        imageSet = {
          imageUrl: cropped.url,
          imageKey: cropped.key,
          imageOriginalUrl: original.url,
          imageOriginalKey: original.key,
          crop: { zoom, crop, area: croppedArea },
        };
      }

      if (isEdit) {
        await updateBanner(banner!.id, { label: trimmedLabel, link: trimmedLink, ...imageSet });
        onSaved({ label: trimmedLabel, link: trimmedLink, imageUrl: imageSet?.imageUrl });
      } else {
        const res = await createBanner({ label: trimmedLabel, link: trimmedLink, ...imageSet! });
        onSaved({ id: res.id, label: trimmedLabel, link: trimmedLink, imageUrl: imageSet!.imageUrl });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được.");
    } finally {
      setBusy(false);
    }
  }

  const showCropper = !!imageSrc;
  const previewFallback = banner?.imageUrl;

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
        className="relative w-full max-w-[560px] rounded-2xl border border-white/10 bg-[rgba(4,10,18,0.97)] p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      >
        <button
          type="button"
          onClick={() => !busy && onClose()}
          aria-label="Đóng"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-star/45 transition-colors hover:bg-white/5 hover:text-star"
        >
          <X size={17} weight="bold" />
        </button>

        <h2 className="pr-8 text-[16px] font-semibold text-star">
          {isEdit ? "Sửa banner" : "Thêm banner"}
        </h2>

        <p className="mt-2 flex items-start gap-1.5 rounded-xl border border-cosmic-violet/25 bg-cosmic-violet/[0.06] px-3 py-2.5 text-[12px] leading-relaxed text-star/65">
          <Info size={14} className="mt-0.5 shrink-0 text-cosmic-violet" />
          Banner hiển thị trên trang chủ theo đúng tỉ lệ khung <strong className="text-star/85">16 : 5</strong> (vd
          thiết kế sẵn 1600×500px sẽ vừa khít, không bị cắt lệch). Ảnh nào cũng tải lên được — kéo/phóng bên
          dưới để chọn đúng phần muốn hiển thị.
        </p>

        <div className="mt-4 space-y-3.5">
          <div>
            {showCropper ? (
              <div className="relative aspect-16/5 w-full overflow-hidden rounded-xl border border-white/10 bg-black">
                <Cropper
                  image={imageSrc!}
                  crop={crop}
                  zoom={zoom}
                  aspect={ASPECT}
                  showGrid
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_a, areaPixels) => setCroppedArea(areaPixels)}
                />
              </div>
            ) : previewFallback ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewFallback}
                alt=""
                className="aspect-16/5 w-full rounded-xl border border-white/10 object-cover"
              />
            ) : (
              <div className="flex aspect-16/5 w-full items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.03] text-[12.5px] text-star/40">
                Chưa có ảnh
              </div>
            )}

            {showCropper && (
              <div className="mt-3 flex items-center gap-3">
                <MagnifyingGlassMinus size={17} className="shrink-0 text-star/45" />
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  aria-label="Phóng to ảnh"
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-cosmic-violet"
                />
                <MagnifyingGlassPlus size={17} className="shrink-0 text-star/45" />
              </div>
            )}

            <label className="mt-3 flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-[13px] font-medium text-star transition-all duration-300 hover:border-white/20 hover:bg-white/[0.08]">
              <UploadSimple size={16} />
              {isEdit ? "Đổi ảnh khác" : showCropper ? "Chọn ảnh khác" : "Chọn ảnh từ máy"}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} className="hidden" />
            </label>
          </div>

          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-star/60">
              Nhãn nội bộ (chỉ admin thấy, không hiện cho người mua)
            </label>
            <input
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setError("");
              }}
              maxLength={100}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[13.5px] text-star outline-none transition-colors placeholder:text-star/30 focus:border-cosmic-violet/50"
              placeholder="Vd: Sale Tết 2026 — trang chủ"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12.5px] font-medium text-star/60">
              Đường dẫn khi bấm vào (tuỳ chọn)
            </label>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              maxLength={300}
              className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[13.5px] text-star outline-none transition-colors placeholder:text-star/30 focus:border-cosmic-violet/50"
              placeholder="Vd: /search?category=thoi-trang-nam"
            />
            <p className="mt-1.5 text-[11.5px] text-star/35">
              Để trống nếu banner chỉ minh hoạ, không cần bấm vào đâu.
            </p>
          </div>

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
