/**
 * Tiện ích xử lý chữ tiếng Việt cho tìm kiếm và slug.
 *
 * Vì sao cần bỏ dấu: người Việt gõ tìm kiếm thường không dấu ("ao thun",
 * "dien thoai"). Nếu chỉ so khớp chuỗi có dấu thì tìm kiếm coi như hỏng.
 */

/** Bỏ dấu + thường hoá: "Áo Thun Nữ" → "ao thun nu". */
export function deaccent(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

/** Chuẩn hoá thành slug URL: "Áo Thun Nữ" → "ao-thun-nu". */
export function slugify(input: string, maxLength = 60): string {
  return (
    deaccent(input)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, maxLength) || 'san-pham'
  );
}

/** Hậu tố ngẫu nhiên ngắn để slug không đụng nhau giữa các shop. */
export function shortId(length = 6): string {
  return Math.random()
    .toString(36)
    .slice(2, 2 + length);
}

/**
 * Gom các phần chữ của sản phẩm thành một chuỗi ĐÃ BỎ DẤU để đánh index
 * tìm kiếm. Lọc rỗng + bỏ trùng để chuỗi không phình vô ích.
 */
export function buildSearchText(parts: (string | undefined | null)[]): string {
  const words = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    for (const w of deaccent(part).split(/\s+/)) {
      if (w) words.add(w);
    }
  }
  return [...words].join(' ');
}
