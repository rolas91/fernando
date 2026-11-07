import { AUTH_MESSAGES } from './authErrors';

const API_BASE = import.meta.env.VITE_API_URL || '';
const API_PREFIX = '/api';

type RecoveryResponse = { success: boolean; message: string };

async function publicAuthRequest(
  path: string,
  body: Record<string, string>,
): Promise<RecoveryResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error('[Auth] Password recovery network request failed', {
      path,
      error,
    });
    throw new Error(AUTH_MESSAGES.network);
  }

  let payload: Partial<RecoveryResponse> & { message?: string | string[] } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {}

  if (!response.ok) {
    console.error('[Auth] Password recovery request rejected', {
      path,
      status: response.status,
    });
    if (response.status >= 500) throw new Error(AUTH_MESSAGES.server);
    const detail = Array.isArray(payload.message)
      ? payload.message[0]
      : payload.message;
    throw new Error(detail || AUTH_MESSAGES.server);
  }

  return {
    success: payload.success !== false,
    message: typeof payload.message === 'string' ? payload.message : '',
  };
}

export function requestPasswordReset(email: string) {
  return publicAuthRequest('/auth/forgot-password', { email });
}

export function completePasswordReset(token: string, newPassword: string) {
  return publicAuthRequest('/auth/reset-password', { token, newPassword });
}
