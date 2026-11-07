import { io, type Socket } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || '';
const REALTIME_URL = import.meta.env.VITE_REALTIME_URL || API_BASE;
const API_PREFIX = '/api';

export type ShiftChatMessage = {
  id: string;
  workOrderId: string;
  shiftId: string;
  senderUserId: string;
  senderWorkerId: string;
  senderName: string;
  kind: 'text' | 'image' | 'audio';
  body: string;
  mediaUrl: string;
  mediaName: string;
  mediaContentType: string;
  mediaSize: number;
  replyToMessageId: string;
  replyToSenderName: string;
  replyToKind: string;
  replyToPreview: string;
  createdAt: string;
};

function token() {
  return (
    localStorage.getItem('auth_token') ||
    localStorage.getItem('dr_auth_token') ||
    ''
  );
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
    ...options,
    headers: {
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(options?.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : body?.message || `Chat request failed (${response.status})`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function fetchShiftChatMessages(shiftId: string) {
  return request<ShiftChatMessage[]>(
    `/shift-chat/${encodeURIComponent(shiftId)}/messages`,
  );
}

export function fetchShiftChatUnreadCount(shiftId: string) {
  return request<{ shiftId: string; unreadCount: number }>(
    `/shift-chat/${encodeURIComponent(shiftId)}/unread-count`,
  );
}

export function markShiftChatRead(shiftId: string) {
  return request<{ shiftId: string; unreadCount: number }>(
    `/shift-chat/${encodeURIComponent(shiftId)}/read`,
    { method: 'POST' },
  );
}

export function sendShiftChatMessage(
  shiftId: string,
  payload: Partial<ShiftChatMessage>,
) {
  return request<ShiftChatMessage>(
    `/shift-chat/${encodeURIComponent(shiftId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function deleteShiftChatMessage(shiftId: string, messageId: string) {
  return request<{ id: string; shiftId: string }>(
    `/shift-chat/${encodeURIComponent(shiftId)}/messages/${encodeURIComponent(messageId)}`,
    { method: 'DELETE' },
  );
}

export async function uploadShiftChatFile(shiftId: string, file: File) {
  const formData = new FormData();
  formData.append('files', file);
  const uploads = await request<
    Array<{
      url: string;
      key: string;
      name: string;
      size: number;
      contentType: string;
    }>
  >(`/shift-chat/${encodeURIComponent(shiftId)}/uploads`, {
    method: 'POST',
    body: formData,
  });
  return uploads[0] || null;
}

export function connectShiftChatSocket(params: {
  shiftId: string;
  onMessage: (message: ShiftChatMessage) => void;
  onMessageDeleted: (payload: { id: string; shiftId: string }) => void;
}) {
  const socket: Socket = io(`${REALTIME_URL}/shift-chat`, {
    transports: ['websocket'],
    auth: { token: token() },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 800,
  });
  socket.on('connect', () => {
    socket.emit('shift-chat:join', { shiftId: params.shiftId });
  });
  socket.on('shift-chat:message', params.onMessage);
  socket.on('shift-chat:message-deleted', params.onMessageDeleted);
  return socket;
}
