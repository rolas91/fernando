import { io, type Socket } from 'socket.io-client';
import { requireApiBaseUrl } from './api-config';
import { apiResponseError, fetchWithFriendlyNetworkError } from './auth-errors';

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

type UploadAsset = {
  uri: string;
  name: string;
  type: string;
};

async function request<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const apiBaseUrl = requireApiBaseUrl();
  const response = await fetchWithFriendlyNetworkError(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  if (!response.ok) throw await apiResponseError(response, path);
  return (await response.json()) as T;
}

export function socketBaseUrl() {
  return requireApiBaseUrl().replace(/\/api\/?$/, '');
}

export function connectShiftChatSocket(params: {
  token: string;
  shiftId: string;
  onMessage: (message: ShiftChatMessage) => void;
  onMessageDeleted?: (payload: { id: string; shiftId: string }) => void;
}) {
  const socket: Socket = io(`${socketBaseUrl()}/shift-chat`, {
    transports: ['websocket'],
    auth: { token: params.token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 800,
  });
  socket.on('connect', () => {
    socket.emit('shift-chat:join', { shiftId: params.shiftId });
  });
  socket.on('shift-chat:message', params.onMessage);
  if (params.onMessageDeleted) {
    socket.on('shift-chat:message-deleted', params.onMessageDeleted);
  }
  return socket;
}

export function fetchShiftChatMessages(params: {
  token: string;
  shiftId: string;
}) {
  return request<ShiftChatMessage[]>(
    `/shift-chat/${params.shiftId}/messages`,
    params.token,
  );
}

export function fetchShiftChatUnreadCount(params: {
  token: string;
  shiftId: string;
}) {
  return request<{ shiftId: string; unreadCount: number }>(
    `/shift-chat/${params.shiftId}/unread-count`,
    params.token,
  );
}

export function markShiftChatRead(params: { token: string; shiftId: string }) {
  return request<{ shiftId: string; unreadCount: number }>(
    `/shift-chat/${params.shiftId}/read`,
    params.token,
    { method: 'POST' },
  );
}

export function sendShiftChatMessage(params: {
  token: string;
  shiftId: string;
  body?: string;
  kind?: 'text' | 'image' | 'audio';
  mediaUrl?: string;
  mediaName?: string;
  mediaContentType?: string;
  mediaSize?: number;
  replyToMessageId?: string;
  replyToSenderName?: string;
  replyToKind?: string;
  replyToPreview?: string;
}) {
  return request<ShiftChatMessage>(
    `/shift-chat/${params.shiftId}/messages`,
    params.token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: params.body ?? '',
        kind: params.kind,
        mediaUrl: params.mediaUrl,
        mediaName: params.mediaName,
        mediaContentType: params.mediaContentType,
        mediaSize: params.mediaSize,
        replyToMessageId: params.replyToMessageId,
        replyToSenderName: params.replyToSenderName,
        replyToKind: params.replyToKind,
        replyToPreview: params.replyToPreview,
      }),
    },
  );
}

export function deleteShiftChatMessage(params: {
  token: string;
  shiftId: string;
  messageId: string;
}) {
  return request<{ id: string; shiftId: string }>(
    `/shift-chat/${params.shiftId}/messages/${params.messageId}`,
    params.token,
    { method: 'DELETE' },
  );
}

export async function uploadShiftChatMedia(params: {
  token: string;
  shiftId: string;
  asset: UploadAsset;
}) {
  const formData = new FormData();
  formData.append('files', {
    uri: params.asset.uri,
    name: params.asset.name,
    type: params.asset.type,
  } as unknown as Blob);

  const uploads = await request<
    {
      url: string;
      key: string;
      name: string;
      size: number;
      contentType: string;
    }[]
  >(`/shift-chat/${params.shiftId}/uploads`, params.token, {
    method: 'POST',
    body: formData,
  });
  return uploads[0] ?? null;
}
