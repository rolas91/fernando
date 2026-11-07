import { requireApiBaseUrl } from './api-config';
import {
  AUTH_MESSAGES,
  fetchWithFriendlyNetworkError,
  loginResponseMessage,
} from './auth-errors';

export type LoginPayload = {
  email: string;
  password: string;
};

export type LoginResult = {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    roles: string[];
    permissions: string[];
  };
};

const LOGIN_ENDPOINT = '/auth/login';
const FORGOT_PASSWORD_ENDPOINT = '/auth/forgot-password';
const RESET_PASSWORD_ENDPOINT = '/auth/reset-password';

async function loginWithApi(payload: LoginPayload): Promise<LoginResult> {
  const apiBaseUrl = requireApiBaseUrl();

  const response = await fetchWithFriendlyNetworkError(
    `${apiBaseUrl}${LOGIN_ENDPOINT}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    console.warn('[Auth] Login rejected', { status: response.status });
    throw new Error(loginResponseMessage(response.status));
  }

  const data = (await response.json()) as Partial<LoginResult> & {
    access_token?: string;
    user?: Partial<LoginResult['user']> & {
      firstName?: string;
      lastName?: string;
    };
  };
  const token = data.token ?? data.access_token;
  if (!token || !data.user?.id || !data.user?.email) {
    console.error('[Auth] Invalid login response shape');
    throw new Error(AUTH_MESSAGES.server);
  }
  const name =
    data.user.name ??
    [data.user.firstName, data.user.lastName]
      .filter(Boolean)
      .join(' ')
      .trim() ??
    'DR User';

  return {
    token,
    user: {
      id: data.user.id,
      name: name || 'DR User',
      email: data.user.email,
      role: typeof data.user.role === 'string' ? data.user.role : 'viewer',
      roles: Array.isArray(data.user.roles)
        ? data.user.roles.filter(
            (role): role is string => typeof role === 'string',
          )
        : [],
      permissions: Array.isArray(data.user.permissions)
        ? data.user.permissions.filter(
            (permission): permission is string =>
              typeof permission === 'string',
          )
        : [],
    },
  };
}

export async function loginRequest(
  payload: LoginPayload,
): Promise<LoginResult> {
  return loginWithApi(payload);
}

async function passwordRecoveryRequest(
  path: string,
  body: Record<string, string>,
) {
  const apiBaseUrl = requireApiBaseUrl();
  const response = await fetchWithFriendlyNetworkError(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let payload: { success?: boolean; message?: string | string[] } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {}

  if (!response.ok) {
    console.warn('[Auth] Password recovery request rejected', {
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

export function forgotPasswordRequest(email: string) {
  return passwordRecoveryRequest(FORGOT_PASSWORD_ENDPOINT, { email });
}

export function completePasswordResetRequest(
  token: string,
  newPassword: string,
) {
  return passwordRecoveryRequest(RESET_PASSWORD_ENDPOINT, {
    token,
    newPassword,
  });
}
