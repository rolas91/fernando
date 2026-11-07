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

export const AUTH_SESSION_EXPIRED_EVENT = 'dr:auth-session-expired';
export const AUTH_NOTICE_KEY = 'dr_auth_notice';

export class AuthHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AuthHttpError';
  }
}

export function loginErrorMessage(error: unknown) {
  if (error instanceof AuthHttpError) {
    if (error.status === 0) return AUTH_MESSAGES.network;
    if (error.status === 400 || error.status === 401) {
      return AUTH_MESSAGES.invalidCredentials;
    }
    if (error.status === 403) return AUTH_MESSAGES.accountUnavailable;
    if (error.status === 429) return AUTH_MESSAGES.tooManyAttempts;
    if (error.status >= 500) return AUTH_MESSAGES.server;
  }
  return AUTH_MESSAGES.server;
}

export function announceSessionExpired() {
  try {
    sessionStorage.setItem(AUTH_NOTICE_KEY, AUTH_MESSAGES.sessionExpired);
  } catch {}
  window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
}
