import Constants from 'expo-constants';

type ExpoExtra = {
  apiUrl?: string;
};

function cleanUrl(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

export function getApiBaseUrl() {
  return (
    cleanUrl(process.env.EXPO_PUBLIC_API_URL) ||
    cleanUrl((Constants.expoConfig?.extra as ExpoExtra | undefined)?.apiUrl)
  );
}

export function requireApiBaseUrl() {
  const apiUrl = getApiBaseUrl();
  if (!apiUrl) {
    throw new Error(
      'The connection to the system is not configured. Please contact your administrator.',
    );
  }
  return apiUrl;
}
