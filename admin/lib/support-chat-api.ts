/** Client hộp thư CSKH — một hộp thư chung, mọi admin cùng thấy và trả lời. */
import { apiFetch } from "./auth-api";
import { subscribe } from "./socket";

export type SupportSenderRole = "user" | "admin";
export type SupportUserRole = "buyer" | "seller";
export type SupportStatus = "open" | "closed";

export interface SupportChatImage {
  url: string;
}

export interface SupportConversationItem {
  id: string;
  userRole: SupportUserRole;
  status: SupportStatus;
  user: {
    id: string;
    name: string;
    avatarUrl?: string;
    contact: string;
    shopName?: string;
  };
  lastMessage: { text: string; senderRole: SupportSenderRole; at: string } | null;
  lastMessageAt: string;
  unread: number;
}

export interface SupportMessage {
  id: string;
  conversationId: string;
  senderRole: SupportSenderRole;
  text: string;
  images?: SupportChatImage[];
  readAt?: string;
  createdAt: string;
  pending?: boolean;
  failed?: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const raw = data.message;
    const msg = Array.isArray(raw) ? String(raw[0]) : String(raw ?? "");
    throw new Error(msg || "Có lỗi xảy ra. Vui lòng thử lại.");
  }
  return data as T;
}

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function listSupportConversations(
  status: SupportStatus | "all" = "open",
): Promise<{
  items: SupportConversationItem[];
  counts: { open: number; closed: number; all: number };
}> {
  return request(`/admin/support-chat?status=${status}`);
}

export function listSupportMessages(
  conversationId: string,
  before?: string,
): Promise<{ items: SupportMessage[]; hasMore: boolean }> {
  const q = before ? `?before=${encodeURIComponent(before)}` : "";
  return request(`/admin/support-chat/${conversationId}/messages${q}`);
}

export function sendSupportMessage(
  conversationId: string,
  payload: { text?: string; images?: SupportChatImage[] },
): Promise<{ message: SupportMessage }> {
  return request(`/admin/support-chat/${conversationId}/messages`, json(payload));
}

export function markSupportRead(conversationId: string): Promise<{ ok: boolean }> {
  return request(`/admin/support-chat/${conversationId}/read`, json({}));
}

export function closeSupportConversation(
  conversationId: string,
): Promise<{ ok: boolean }> {
  return request(`/admin/support-chat/${conversationId}/close`, json({}));
}

export function reopenSupportConversation(
  conversationId: string,
): Promise<{ ok: boolean }> {
  return request(`/admin/support-chat/${conversationId}/reopen`, json({}));
}

export interface SupportChatSocketHandlers {
  onMessage: (e: { conversationId: string; message: SupportMessage }) => void;
  onRead: (e: { conversationId: string }) => void;
}

/** Nghe sự kiện CSKH trên kết nối socket dùng chung — MỘT phòng chung cho mọi admin. */
export function connectSupportChat(handlers: SupportChatSocketHandlers): () => void {
  const offMessage = subscribe("support:message", handlers.onMessage as never);
  const offRead = subscribe("support:read", handlers.onRead as never);
  return () => {
    offMessage();
    offRead();
  };
}
