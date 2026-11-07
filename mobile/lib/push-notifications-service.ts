import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getApiBaseUrl } from './api-config';

function hasNotificationPermission(value: unknown) {
  const record = value as { granted?: unknown; status?: unknown };
  return record.granted === true || record.status === 'granted';
}

function buildUrl(path: string) {
  const base = getApiBaseUrl();
  if (!base) return null;
  return `${base}${path}`;
}

async function sendTokenToBackend(authToken: string, expoPushToken: string) {
  const url = buildUrl('/workers/me/fcm-token');
  if (!url) return;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token: expoPushToken, platform: Platform.OS }),
  });
}

export async function registerDeviceForPush(authToken: string) {
  if (Platform.OS === 'web') return;

  const permission = await Notifications.getPermissionsAsync();
  const finalPermission = hasNotificationPermission(permission)
    ? permission
    : await Notifications.requestPermissionsAsync();
  if (!hasNotificationPermission(finalPermission)) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('shift_notifications', {
      name: 'Shift Notifications',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#CC0000',
    });
  }

  const pushTokenData = await Notifications.getExpoPushTokenAsync();
  if (!pushTokenData?.data) return;

  await sendTokenToBackend(authToken, pushTokenData.data);
}

export function setupPushTokenRefresh(authToken: string) {
  const sub = Notifications.addPushTokenListener((pushTokenData) => {
    if (!pushTokenData?.data) return;
    sendTokenToBackend(authToken, pushTokenData.data).catch((err) => {
      console.warn('[Push] token refresh failed', err);
    });
  });
  return () => sub.remove();
}
