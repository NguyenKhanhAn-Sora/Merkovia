"use client";

import { useEffect, useState } from "react";
import { CircleNotch, MapPin, Package, X } from "@phosphor-icons/react";
import {
  getOrderDetail,
  type AdminOrderDetail,
  type OrderStatus,
} from "../../lib/orders-api";
import { Badge, formatVnd, type BadgeTone } from "./ui";

const STATUS_BADGE: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  pending_payment: { label: "Chờ thanh toán", tone: "neutral" },
  pending: { label: "Chờ xác nhận", tone: "warning" },
  confirmed: { label: "Chờ lấy hàng", tone: "info" },
  shipping: { label: "Đang giao", tone: "info" },
  delivered: { label: "Đã giao", tone: "success" },
  cancelled: { label: "Đã huỷ", tone: "danger" },
  returned: { label: "Đã trả hàng", tone: "danger" },
};

function formatDateTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

/** Chi tiết một đơn hàng — CHỈ ĐỌC. Xử lý tranh chấp huỷ/trả hàng đi qua trang Báo cáo, không lặp lại ở đây. */
export default function OrderDetailModal({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getOrderDetail(orderId)
      .then((d) => {
        if (!cancelled) setOrder(d.order);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Không tải được đơn hàng.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const badge = order ? STATUS_BADGE[order.status] : undefined;
  const addr = order?.shippingAddress;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[85vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(4,10,18,0.97)] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-6 py-4">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-star">
              {order?.orderCode ?? "Đang tải…"}
            </p>
            {order && (
              <p className="mt-0.5 truncate text-[12.5px] text-star/50">
                {order.shop.name} · {formatDateTime(order.createdAt)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-star/45 transition-colors hover:bg-white/5 hover:text-star"
            >
              <X size={17} weight="bold" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <CircleNotch size={22} className="animate-spin text-star/40" />
            </div>
          ) : loadError ? (
            <p className="text-[13.5px] text-rose-300">{loadError}</p>
          ) : order ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 text-[13px]">
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                  <p className="text-star/45">Người mua</p>
                  <p className="mt-1 text-star/85">{order.buyer.contact}</p>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                  <p className="text-star/45">Thanh toán</p>
                  <p className="mt-1 text-star/85">
                    {order.paymentMethod === "cod" ? "Thanh toán khi nhận hàng" : "Thanh toán online"}
                    {order.paidAt ? ` · đã trả ${formatDateTime(order.paidAt)}` : ""}
                  </p>
                </div>
              </div>

              {addr && (
                <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 text-[13px]">
                  <MapPin size={16} className="mt-0.5 shrink-0 text-star/45" />
                  <div className="min-w-0">
                    <p className="text-star/85">
                      {addr.recipientName} · {addr.recipientPhone}
                    </p>
                    <p className="mt-0.5 text-star/55">
                      {[addr.street, addr.ward, addr.district, addr.province].filter(Boolean).join(", ")}
                    </p>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-star/70">
                  <Package size={14} />
                  Sản phẩm ({order.items.length})
                </p>
                <ul className="space-y-2">
                  {order.items.map((it, i) => (
                    <li
                      key={`${it.productId}-${i}`}
                      className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[12.5px]"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.05] text-star/30">
                        {it.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Package size={14} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-star/85">{it.name}</p>
                        {it.variantLabel && <p className="text-star/45">{it.variantLabel}</p>}
                      </div>
                      <p className="shrink-0 text-star/60">
                        {it.quantity} × {formatVnd(it.price)}
                      </p>
                      <p className="shrink-0 font-medium text-star/85">{formatVnd(it.subtotal)}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mb-4 space-y-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5 text-[13px]">
                <div className="flex justify-between text-star/55">
                  <span>Tiền hàng</span>
                  <span>{formatVnd(order.itemsTotal)}</span>
                </div>
                <div className="flex justify-between text-star/55">
                  <span>Vận chuyển</span>
                  <span>{formatVnd(order.shippingFee)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-star/55">
                    <span>Giảm giá</span>
                    <span>-{formatVnd(order.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-white/[0.07] pt-1.5 font-semibold text-star/90">
                  <span>Tổng</span>
                  <span>{formatVnd(order.total)}</span>
                </div>
              </div>

              {(order.cancelReason || order.cancelRequest || order.returnRequest) && (
                <div className="mb-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-[13px] leading-relaxed text-star/80">
                  {order.cancelReason && <p>Lý do huỷ: {order.cancelReason}</p>}
                  {order.cancelRequest && (
                    <p>
                      Yêu cầu huỷ ({order.cancelRequest.status}){" "}
                      {order.cancelRequest.reason ? `— ${order.cancelRequest.reason}` : ""}
                    </p>
                  )}
                  {order.returnRequest && (
                    <p>
                      Yêu cầu trả hàng ({order.returnRequest.status}){" "}
                      {order.returnRequest.reason ? `— ${order.returnRequest.reason}` : ""}
                    </p>
                  )}
                </div>
              )}

              {order.timeline && order.timeline.length > 0 && (
                <div>
                  <p className="mb-2 text-[12.5px] font-semibold text-star/70">Lịch sử đơn hàng</p>
                  <ul className="space-y-2">
                    {order.timeline.map((ev, i) => (
                      <li
                        key={i}
                        className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[12.5px]"
                      >
                        <div className="min-w-0">
                          <p className="text-star/80">{STATUS_BADGE[ev.status]?.label ?? ev.status}</p>
                          {ev.note && <p className="mt-0.5 text-star/50">{ev.note}</p>}
                        </div>
                        <span className="shrink-0 text-star/40">{formatDateTime(ev.at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-white/[0.07] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[13.5px] font-medium text-star/70 transition-colors hover:border-white/20 hover:text-star"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
