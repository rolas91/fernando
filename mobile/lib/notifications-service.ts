import { requireApiBaseUrl } from './api-config';
import { apiResponseError, fetchWithFriendlyNetworkError } from './auth-errors';

export type MobileNotification = {
  id: string;
  type: string;
  channel: string;
  title: string;
  message: string;
  timestamp: string | null;
  read: boolean;
  acknowledgedAt: string | null;
  link: string | null;
  workerId: string | null;
  workOrderId: string | null;
  shiftId: string | null;
  roleId: string | null;
  deliveryStatus: string | null;
  providerMessageId: string | null;
  createdAt: string;
  updatedAt: string;
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
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) throw await apiResponseError(response, path);

  return (await response.json()) as T;
}

export function fetchMobileNotifications(token: string) {
  return request<MobileNotification[]>('/notifications/mobile/me', token);
}

export function markMobileNotificationRead(
  token: string,
  notificationId: string,
) {
  return request<MobileNotification>(
    `/notifications/mobile/${notificationId}/read`,
    token,
    {
      method: 'PATCH',
    },
  );
}

export function deleteMobileNotification(
  token: string,
  notificationId: string,
) {
  return request<{ success: true }>(
    `/notifications/mobile/${notificationId}`,
    token,
    {
      method: 'DELETE',
    },
  );
}

export function acknowledgeShiftCancellation(
  token: string,
  notificationId: string,
) {
  return request<MobileNotification>(
    `/notifications/mobile/${notificationId}/acknowledge-cancellation`,
    token,
    { method: 'PATCH' },
  );
}
