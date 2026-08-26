"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle,
  Headset,
  PaperPlaneTilt,
  Storefront,
  User as UserIcon,
} from "@phosphor-icons/react";
import {
  Badge,
  EmptyState,
  GhostButton,
  Panel,
  PrimaryButton,
  TabBar,
} from "../../../components/dashboard/ui";
import MediaLightbox from "../../../components/dashboard/MediaLightbox";
import {
  closeSupportConversation,
  connectSupportChat,
  listSupportConversations,
  listSupportMessages,
  markSupportRead,
  reopenSupportConversation,
  sendSupportMessage,
  type SupportConversationItem,
  type SupportMessage,
} from "../../../lib/support-chat-api";

const USER_ROLE_LABEL: Record<string, string> = {
  buyer: "Người mua",
  seller: "Người bán",
};

function chatTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Vừa xong";
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} ngày`;
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

export default function AdminSupportPage() {
  const [tab, setTab] = useState<"open" | "closed" | "all">("open");
  const [items, setItems] = useState<SupportConversationItem[]>([]);
  const [counts, setCounts] = useState({ open: 0, closed: 0, all: 0 });
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string }[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const boxRef = useRef<HTMLDivElement>(null);

  const active = items.find((c) => c.id === activeId) ?? null;

  const loadList = () => {
    setLoadingList(true);
    listSupportConversations(tab)
      .then((res) => {
        setItems(res.items);
        setCounts(res.counts);
        setError("");
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Không tải được danh sách."),
      )
      .finally(() => setLoadingList(false));
  };

  useEffect(loadList, [tab]);

  const openConversation = async (id: string) => {
    setActiveId(id);
    setLoadingMsgs(true);
    try {
      const { items: msgs, hasMore: more } = await listSupportMessages(id);
      setMessages(msgs);
      setHasMore(more);
      await markSupportRead(id);
      setItems((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Không tải được cuộc trò chuyện.");
    } finally {
      setLoadingMsgs(false);
    }
  };

  useEffect(() => {
    return connectSupportChat({
      onMessage: ({ conversationId, message }) => {
        // Cập nhật danh sách (tin cuối + đưa lên đầu) bất kể đang mở hội thoại nào.
        setItems((prev) => {
          const idx = prev.findIndex((c) => c.id === conversationId);
          if (idx === -1) {
            loadList(); // hội thoại mới toanh (lần đầu người dùng nhắn) — tải lại cả trang.
            return prev;
          }
          const updated = {
            ...prev[idx],
            lastMessage: { text: message.text, senderRole: message.senderRole, at: message.createdAt },
            lastMessageAt: message.createdAt,
            unread: conversationId === activeIdRef.current ? 0 : prev[idx].unread + 1,
          };
          return [updated, ...prev.filter((_, i) => i !== idx)];
        });
        if (conversationId === activeIdRef.current) {
          setMessages((prev) =>
            prev.some((m) => m.id === message.id) ? prev : [...prev, message],
          );
          void markSupportRead(conversationId);
        }
      },
      onRead: () => undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const loadOlder = async () => {
    if (!activeId) return;
    const oldest = messages[0]?.createdAt;
    if (!oldest) return;
    const { items: older, hasMore: more } = await listSupportMessages(activeId, oldest);
    setMessages((prev) => [...older, ...prev]);
    setHasMore(more);
  };

  const send = async () => {
    const body = text.trim();
    if (!activeId || !body || sending) return;
    setSending(true);
    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        conversationId: activeId,
        senderRole: "admin",
        text: body,
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    setText("");
    try {
      const { message } = await sendSupportMessage(activeId, { text: body });
      setMessages((prev) => prev.map((m) => (m.id === tempId ? message : m)));
      setItems((prev) => {
        const idx = prev.findIndex((c) => c.id === activeId);
        if (idx === -1) return prev;
        const updated = {
          ...prev[idx],
          lastMessage: { text: body, senderRole: "admin" as const, at: message.createdAt },
          lastMessageAt: message.createdAt,
        };
        return [updated, ...prev.filter((_, i) => i !== idx)];
      });
    } catch (e: unknown) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
      );
      setError(e instanceof Error ? e.message : "Không gửi được tin nhắn.");
    } finally {
      setSending(false);
    }
  };

  const toggleStatus = async () => {
    if (!active) return;
    setBusy(true);
    try {
      if (active.status === "open") await closeSupportConversation(active.id);
      else await reopenSupportConversation(active.id);
      loadList();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Không cập nhật được trạng thái.");
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    { key: "open", label: "Đang mở", count: counts.open },
    { key: "closed", label: "Đã đóng", count: counts.closed },
    { key: "all", label: "Tất cả", count: counts.all },
  ];

  return (
    <>
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-star">
          <Headset size={24} weight="duotone" className="text-cosmic-violet" />
          Hỗ trợ (CSKH)
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-star/55">
          Hộp thư chung — mọi quản trị viên đăng nhập đều thấy và trả lời được cùng danh sách này.
        </p>
      </header>

      {error && (
        <div className="mb-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3.5 text-[13.5px] text-rose-200">
          {error}
        </div>
      )}

      <Panel padded={false}>
        <div className="grid h-[min(75vh,680px)] grid-cols-1 md:grid-cols-[320px_1fr]">
          {/* Danh sách */}
          <div
            className={`flex min-h-0 flex-col border-white/[0.07] md:border-r ${
              active ? "hidden md:flex" : "flex"
            }`}
          >
            <div className="px-4 pt-4">
              <TabBar tabs={tabs} value={tab} onChange={(k) => setTab(k as typeof tab)} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loadingList ? (
                <p className="py-10 text-center text-[13px] text-star/40">Đang tải…</p>
              ) : items.length === 0 ? (
                <EmptyState
                  icon={Headset}
                  title="Không có hội thoại nào"
                  description="Chưa có buyer/seller nào cần hỗ trợ ở mục này."
                  compact
                />
              ) : (
                items.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void openConversation(c.id)}
                    className={`flex w-full items-start gap-3 border-b border-white/[0.05] px-4 py-3 text-left transition-colors ${
                      c.id === activeId ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-star/40">
                      {c.userRole === "seller" ? (
                        <Storefront size={18} weight="duotone" />
                      ) : (
                        <UserIcon size={18} weight="duotone" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-[13.5px] ${
                            c.unread > 0 ? "font-semibold text-star" : "text-star/85"
                          }`}
                        >
                          {c.user.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-star/35">
                          {chatTime(c.lastMessageAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <Badge tone={c.userRole === "seller" ? "info" : "neutral"}>
                          {USER_ROLE_LABEL[c.userRole]}
                        </Badge>
                        {c.status === "closed" && <Badge tone="neutral">Đã đóng</Badge>}
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span
                          className={`min-w-0 flex-1 truncate text-[12.5px] ${
                            c.unread > 0 ? "font-medium text-star/80" : "text-star/45"
                          }`}
                        >
                          {c.lastMessage
                            ? `${c.lastMessage.senderRole === "admin" ? "Bạn: " : ""}${c.lastMessage.text}`
                            : "Chưa có tin nhắn"}
                        </span>
                        {c.unread > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-cosmic-fuchsia px-1 text-[11px] font-bold text-white">
                            {c.unread > 9 ? "9+" : c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Hội thoại */}
          <div className={`flex min-h-0 flex-col ${active ? "flex" : "hidden md:flex"}`}>
            {!active ? (
              <div className="flex flex-1 items-center justify-center">
                <EmptyState
                  icon={Headset}
                  title="Chọn một hội thoại"
                  description="Chọn một cuộc trò chuyện ở danh sách bên trái để xem và trả lời."
                />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setActiveId(null)}
                    aria-label="Về danh sách"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-star/50 transition-colors hover:bg-white/[0.06] hover:text-star md:hidden"
                  >
                    <ArrowLeft size={17} />
                  </button>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-star/40">
                    {active.userRole === "seller" ? (
                      <Storefront size={17} weight="duotone" />
                    ) : (
                      <UserIcon size={17} weight="duotone" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium leading-tight text-star">
                      {active.user.name}
                      {active.user.shopName ? ` · ${active.user.shopName}` : ""}
                    </p>
                    <p className="truncate text-[12px] leading-tight text-star/40">
                      {USER_ROLE_LABEL[active.userRole]} · {active.user.contact}
                    </p>
                  </div>
                  <GhostButton
                    className="h-9 text-[12.5px]"
                    icon={active.status === "open" ? CheckCircle : undefined}
                    disabled={busy}
                    onClick={() => void toggleStatus()}
                  >
                    {active.status === "open" ? "Đóng" : "Mở lại"}
                  </GhostButton>
                </div>

                <div ref={boxRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  {hasMore && (
                    <div className="mb-3 flex justify-center">
                      <button
                        type="button"
                        onClick={() => void loadOlder()}
                        className="rounded-full border border-white/10 px-3 py-1 text-[12px] text-star/55 hover:border-white/25 hover:text-star"
                      >
                        Xem tin cũ hơn
                      </button>
                    </div>
                  )}
                  {loadingMsgs ? (
                    <p className="py-10 text-center text-[13px] text-star/40">Đang tải…</p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {messages.map((m) => {
                        const mine = m.senderRole === "admin";
                        return (
                          <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                            <div className={`flex max-w-[75%] flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                              {!!m.images?.length && (
                                <div className="grid grid-cols-2 gap-1">
                                  {m.images.map((img, i) => (
                                    <button
                                      key={img.url + i}
                                      type="button"
                                      onClick={() => {
                                        setLightbox(m.images ?? []);
                                        setLightboxIndex(i);
                                      }}
                                      className="overflow-hidden rounded-xl border border-white/10"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={img.url} alt="" className="h-28 w-full object-cover" />
                                    </button>
                                  ))}
                                </div>
                              )}
                              {m.text && (
                                <div
                                  className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed ${
                                    mine
                                      ? `bg-gradient-to-r from-cosmic-blue to-cosmic-fuchsia text-white ${m.pending ? "opacity-60" : ""} ${m.failed ? "from-rose-600 to-rose-500" : ""}`
                                      : "bg-white/[0.07] text-star/90"
                                  }`}
                                >
                                  {m.text}
                                </div>
                              )}
                            </div>
                            <span className="mt-0.5 px-1 text-[10.5px] text-star/30">
                              {m.failed ? "Gửi thất bại" : m.pending ? "Đang gửi…" : chatTime(m.createdAt)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="border-t border-white/[0.07] p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      rows={1}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      placeholder="Nhập phản hồi…"
                      className="max-h-24 flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-star placeholder:text-star/30 outline-none transition-colors focus:border-cosmic-violet/50"
                    />
                    <PrimaryButton
                      icon={sending ? undefined : PaperPlaneTilt}
                      disabled={sending || !text.trim()}
                      onClick={() => void send()}
                    >
                      Gửi
                    </PrimaryButton>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Panel>

      <MediaLightbox
        items={(lightbox ?? []).map((i) => ({ url: i.url, kind: "image" as const }))}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}
