export const AUTH_MESSAGES = {
  invalidCredentials: 'Incorrect email or password. Please try again.',
  missingCredentials: 'Please enter your email and password.',
  accountUnavailable:
    'Your account is currently unavailable. Please contact your administrator.',
  network:
    'Unable to connect. Please check your internet connection and try again.',
  server: 'Something went wrong. Please try again later.',
  sessionExpired: 'Your session has expired. Please sign in again.',
  tooManyAttempts:
    'Too many unsuccessful login attempts. Please try again later.',
} as const;

type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

export function subscribeToSessionExpired(listener: SessionExpiredListener) {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

function notifySessionExpired() {
  sessionExpiredListeners.forEach((listener) => listener());
}

export async function fetchWithFriendlyNetworkError(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    return await fetch(input, init);
  } catch (error) {
    console.warn('[API] Network request failed', {
      input: String(input),
      error,
    });
    throw new Error(AUTH_MESSAGES.network);
  }
}

export async function apiResponseError(response: Response, path: string) {
  let detail = '';
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (body.message) {
      detail = Array.isArray(body.message)
        ? body.message.join(', ')
        : body.message;
    }
  } catch {}

  console.warn('[API] Request rejected', {
    path,
    status: response.status,
    detail,
  });

  if (response.status === 401) {
    notifySessionExpired();
    return new Error(AUTH_MESSAGES.sessionExpired);
  }
  if (response.status === 429) return new Error(AUTH_MESSAGES.tooManyAttempts);
  if (response.status >= 500) return new Error(AUTH_MESSAGES.server);
  return new Error(detail || AUTH_MESSAGES.server);
}

export function loginResponseMessage(status: number) {
  if (status === 400 || status === 401) return AUTH_MESSAGES.invalidCredentials;
  if (status === 403) return AUTH_MESSAGES.accountUnavailable;
  if (status === 429) return AUTH_MESSAGES.tooManyAttempts;
  return AUTH_MESSAGES.server;
}
