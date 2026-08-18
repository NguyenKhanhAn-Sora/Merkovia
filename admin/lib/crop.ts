import { type Area } from "react-easy-crop";

/** Chuyển dataURL (từ FileReader) thành Blob để upload. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(head)?.[1] ?? "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không đọc được ảnh."));
    img.src = src;
  });
}

/**
 * Vẽ vùng đã crop (zoom + vị trí) ra canvas kích thước `width`×`height` → Blob
 * JPEG — đúng khớp tỉ lệ khung hiển thị thật (vd banner 1600×500), khác
 * `seller/lib/crop.ts` (luôn ép vuông cho logo). Ảnh xuất ra đã ĐÚNG tỉ lệ
 * khung buyer sẽ hiển thị, nên buyer chỉ cần `object-cover` — không còn cắt
 * thêm gì nữa, hiển thị đúng y hệt phần admin đã chọn.
 */
export async function getCroppedBlob(
  imageSrc: string,
  area: Area,
  width: number,
  height: number,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ canvas.");
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Cắt ảnh thất bại."))),
      "image/jpeg",
      0.9,
    );
  });
}
