import type { ProductDocument } from '../products/schemas/product.schema';

/**
 * Gom phần chữ của sản phẩm thành văn bản tự nhiên cho model embedding.
 *
 * Khác `buildSearchText` (bỏ dấu, tách token cho regex): ở đây GIỮ NGUYÊN dấu và
 * câu chữ — model ngữ nghĩa hiểu tiếng Việt có dấu tốt hơn nhiều so với chuỗi đã
 * bị bằm. Cắt bớt để không vượt hạn mức token và không tốn tiền vô ích.
 */
const MAX_CHARS = 2000;

export function buildEmbedText(
  product: Pick<
    ProductDocument,
    'name' | 'description' | 'attributes' | 'optionTiers'
  >,
  categoryName?: string,
): string {
  const parts: string[] = [];
  if (product.name) parts.push(product.name);
  if (categoryName) parts.push(categoryName);
  // Thuộc tính "Chất liệu: cotton" mang nhiều ngữ nghĩa hơn giá/kho.
  for (const a of product.attributes ?? []) {
    if (a?.name && a?.value) parts.push(`${a.name}: ${a.value}`);
  }
  for (const t of product.optionTiers ?? []) {
    if (t?.values?.length) parts.push(`${t.name}: ${t.values.join(', ')}`);
  }
  if (product.description) parts.push(product.description);

  return parts
    .join('. ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHARS);
}
