import type { Href } from 'expo-router';

/**
 * Notification payload fields sent by the backend for shift and chat pushes.
 * The same shape is used by the in-app notification list.
 */
export type NotificationPayload = {
  type?: unknown;
  workOrderId?: unknown;
  shiftId?: unknown;
  notificationId?: unknown;
  shiftDate?: unknown;
  conversationTitle?: unknown;
};

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Deep link to the shift detail. Every entry point (push tap, notification
 * list) builds the route here so a notification always lands on the same
 * detail screen with the shift and cancellation identifiers it needs.
 */
export function shiftDetailHref(params: {
  assignmentId: string;
  shiftId?: string | null;
  notificationId?: string | null;
}): Href {
  const shiftId = text(params.shiftId);
  const notificationId = text(params.notificationId);
  return {
    pathname: '/work-orders',
    params: {
      assignmentId: params.assignmentId,
      ...(shiftId ? { shiftId } : {}),
      ...(notificationId ? { notificationId } : {}),
    },
  } as Href;
}

export function shiftChatHref(params: {
  assignmentId: string;
  shiftId: string;
  title: string;
  shiftDate?: string | null;
}): Href {
  return {
    pathname: '/work-orders/chat',
    params: {
      assignmentId: params.assignmentId,
      shiftId: params.shiftId,
      title: params.title,
      ...(text(params.shiftDate) ? { shiftDate: text(params.shiftDate) } : {}),
    },
  } as Href;
}

/**
 * Resolves the deep link carried by a push notification response. Returns
 * null for payloads that do not target a shift.
 */
export function notificationDeepLink(
  data?: NotificationPayload | null,
): Href | null {
  const payload = data ?? {};
  const assignmentId = text(payload.workOrderId);
  const shiftId = text(payload.shiftId);
  const notificationId = text(payload.notificationId);

  if (payload.type === 'shift_chat_message' && shiftId) {
    return shiftChatHref({
      assignmentId,
      shiftId,
      title: text(payload.conversationTitle) || 'Shift Chat',
      shiftDate: text(payload.shiftDate),
    });
  }

  if (!assignmentId) return null;

  return shiftDetailHref({ assignmentId, shiftId, notificationId });
}
