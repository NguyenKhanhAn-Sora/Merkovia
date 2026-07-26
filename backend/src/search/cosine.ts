/**
 * Toán tương đồng cosine cho tìm kiếm ngữ nghĩa — tách riêng, KHÔNG phụ thuộc
 * Nest/Mongo để kiểm thử độc lập được.
 */

/** Độ dài (norm) của vector. */
export function norm(v: number[]): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

/** Tích vô hướng — hai vector PHẢI cùng số chiều. */
export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Cosine similarity trong [-1, 1]. Trả 0 nếu lệch số chiều hoặc có vector 0 —
 * "không kết luận được độ giống" an toàn hơn là ném lỗi giữa vòng xếp hạng.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}
