/**
 * Client cho tranh chấp huỷ/trả hàng của gian hàng ĐANG BỊ ĐÌNH CHỈ.
 *
 * Shop bị đình chỉ không được tự duyệt yêu cầu huỷ/trả hàng (xung đột lợi ích
 * — họ có động cơ từ chối để giữ tiền), nên admin xử lý thay qua đây.
 */
import { apiFetch } from "./auth-api";

export type DisputeType = "cancel" | "return";

/** Khớp `CANCEL_REASONS`/`RETURN_REASONS` phía backend. */
export const CANCEL_REASON_LABEL: Record<string, string> = {
  changed_mind: "Đổi ý, không muốn mua nữa",
  ordered_wrong: "Đặt nhầm sản phẩm / phân loại / số lượng",
  found_better_price: "Tìm được nơi bán giá tốt hơn",
  update_info: "Muốn thay đổi địa chỉ / phương thức thanh toán",
  delivery_too_long: "Thời gian giao hàng dự kiến quá lâu",
  other: "Lý do khác",
};
export const RETURN_REASON_LABEL: Record<string, string> = {
  damaged: "Hàng bị hư hỏng / vỡ khi nhận",
  wrong_item: "Giao sai sản phẩm / phân loại",
  not_as_described: "Khác với mô tả hoặc hình ảnh",
  missing_parts: "Thiếu phụ kiện / thiếu số lượng",
  other: "Lý do khác",
};

export interface OrderDisputeItem {
  orderId: string;
  orderCode: string;
  shopId: string;
  shopName: string;
  type: DisputeType;
  reasonType?: string;
  reason?: string;
  requestedAt: string;
  buyerContact: string;
  total: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const raw = data.message;
    const message = Array.isArray(raw) ? String(raw[0]) : String(raw ?? "");
    throw new Error(message || "Có lỗi xảy ra. Vui lòng thử lại.");
  }
  return data as T;
}

export function getDisputes(): Promise<OrderDisputeItem[]> {
  return request("/admin/orders/disputes");
}

export function respondDispute(
  orderId: string,
  type: DisputeType,
  approve: boolean,
  note?: string,
): Promise<{ ok: boolean }> {
  const path =
    type === "cancel"
      ? `/admin/orders/${orderId}/cancel-request`
      : `/admin/orders/${orderId}/return-request`;
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approve, note }),
  });
}
