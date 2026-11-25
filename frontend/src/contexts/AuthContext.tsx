import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { UserProfile, UserRole } from '@/lib/types';
import {
  AUTH_MESSAGES,
  AUTH_NOTICE_KEY,
  AUTH_SESSION_EXPIRED_EVENT,
  AuthHttpError,
  loginErrorMessage,
} from '@/lib/authErrors';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: UserRole;
    phone?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  updateProfile: (
    updates: Partial<UserProfile>,
  ) => Promise<{ success: boolean; error?: string }>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ success: boolean; error?: string }>;
  hasPermission: (requiredRole: UserRole | UserRole[]) => boolean;
  canEdit: (module: string) => boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 4,
  manager: 3,
  scheduler: 2,
  viewer: 1,
};

const MODULE_PERMISSION_MAP: Record<string, string[]> = {
  availability: ['availability-requests.write'],
  clients: ['clients.write'],
  equipment: ['equipment.write'],
  forms: ['form-templates.write', 'form-submissions.write'],
  incidents: ['incidents.write'],
  projects: ['projects.write'],
  scheduler: ['shifts.write', 'work-orders.write'],
  settings: ['company-settings.write'],
  timesheets: ['timesheets.write'],
  users: ['users.write'],
  workers: ['workers.write'],
  workorders: ['work-orders.write'],
};

const SESSION_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const LEGACY_SESSION_KEY = 'dr_auth_token';
const LEGACY_USER_KEY = 'dr_auth_user';
const API_BASE = import.meta.env.VITE_API_URL || '';
const API_PREFIX = '/api';

function getStoredToken() {
  return (
    localStorage.getItem(SESSION_KEY) ||
    localStorage.getItem(LEGACY_SESSION_KEY)
  );
}

function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(LEGACY_SESSION_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}

function persistSession(token: string, user: UserProfile) {
  localStorage.setItem(SESSION_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.removeItem(LEGACY_SESSION_KEY);
  localStorage.removeItem(LEGACY_USER_KEY);
}

function mapAuthUser(data: any): UserProfile {
  const roles = Array.isArray(data?.roles) ? data.roles : [];
  const primaryRole = (data?.role || roles[0] || 'viewer') as UserRole;

  return {
    id: data.id,
    email: data.email,
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    role: primaryRole,
    webAccessEnabled: primaryRole === 'admin' || data.webAccessEnabled === true,
    roles,
    permissions: Array.isArray(data?.permissions) ? data.permissions : [],
    phone: data.phone || '',
    avatarUrl: data.avatarUrl || '',
    status: data.status || 'active',
    lastLogin: data.lastLogin || undefined,
    createdAt: data.createdAt || undefined,
    updatedAt: data.updatedAt || undefined,
  };
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const incomingHeaders =
    (options?.headers as Record<string, string> | undefined) || {};
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'web',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...incomingHeaders,
      },
    });
  } catch (error) {
    console.error('[Auth] Network request failed', { path, error });
    throw new AuthHttpError(0, AUTH_MESSAGES.network);
  }

  if (!res.ok) {
    let message: string = AUTH_MESSAGES.server;
    try {
      const body = await res.json();
      const detail = Array.isArray(body?.message)
        ? body.message.join(', ')
        : body?.message || body?.error;
      if (detail) message = String(detail);
    } catch {}
    console.error('[Auth] Request rejected', {
      path,
      status: res.status,
      detail: message,
    });
    throw new AuthHttpError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const expireSession = () => {
      clearStoredSession();
      setUser(null);
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, expireSession);
    return () =>
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, expireSession);
  }, []);

  useEffect(() => {
    let disposed = false;
    let checking = false;
    let initialized = false;
    const checkSession = async () => {
      if (checking || disposed) return;
      checking = true;
      const token = getStoredToken();
      try {
        if (!token) {
          setUser(null);
          setIsLoading(false);
          return;
        }

        const currentUser = await apiRequest<any>('/auth/me');
        if (disposed || getStoredToken() !== token) return;
        const mappedUser = mapAuthUser(currentUser);
        if (!mappedUser.webAccessEnabled)
          throw new AuthHttpError(403, AUTH_MESSAGES.webAccessDenied);
        localStorage.setItem(USER_KEY, JSON.stringify(mappedUser));
        localStorage.setItem(SESSION_KEY, token);
        localStorage.removeItem(LEGACY_USER_KEY);
        localStorage.removeItem(LEGACY_SESSION_KEY);
        setUser(mappedUser);
      } catch (error) {
        if (disposed || getStoredToken() !== token) return;
        if (
          initialized &&
          (!(error instanceof AuthHttpError) ||
            ![401, 403].includes(error.status))
        )
          return;
        if (
          error instanceof AuthHttpError &&
          [401, 403].includes(error.status)
        ) {
          try {
            sessionStorage.setItem(
              AUTH_NOTICE_KEY,
              error.status === 403
                ? AUTH_MESSAGES.webAccessDenied
                : AUTH_MESSAGES.sessionExpired,
            );
          } catch {}
        }
        clearStoredSession();
        setUser(null);
      } finally {
        checking = false;
        initialized = true;
        if (!disposed) setIsLoading(false);
      }
    };

    void checkSession();
    const timer = window.setInterval(() => {
      void checkSession();
    }, 30000);
    const onFocus = () => {
      void checkSession();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const result = await apiRequest<{ access_token: string; user: unknown }>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
            platform: 'web',
          }),
        },
      );

      const mappedUser = mapAuthUser(result.user);
      if (!mappedUser.webAccessEnabled)
        throw new AuthHttpError(403, AUTH_MESSAGES.webAccessDenied);
      persistSession(result.access_token, mappedUser);
      setUser(mappedUser);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: loginErrorMessage(err) };
    }
  }, []);

  const register = useCallback(
    async (data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      role?: UserRole;
      phone?: string;
    }) => {
      try {
        const result = await apiRequest<{
          access_token: string;
          user: unknown;
        }>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email: data.email.trim().toLowerCase(),
            password: data.password,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
          }),
        });

        const mappedUser = mapAuthUser(result.user);
        if (!mappedUser.webAccessEnabled)
          throw new AuthHttpError(403, AUTH_MESSAGES.webAccessDenied);
        persistSession(result.access_token, mappedUser);
        setUser(mappedUser);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message || 'Registration failed' };
      }
    },
    [],
  );

  const logout = useCallback(() => {
    clearStoredSession();
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      if (!user) return { success: false, error: 'Not authenticated' };

      try {
        const result = await apiRequest<any>('/auth/me/profile', {
          method: 'PATCH',
          body: JSON.stringify({
            email: updates.email,
            firstName: updates.firstName,
            lastName: updates.lastName,
            phone: updates.phone,
            avatarUrl: updates.avatarUrl,
          }),
        });

        const mappedUser = mapAuthUser(result);
        localStorage.setItem(USER_KEY, JSON.stringify(mappedUser));
        setUser(mappedUser);
        return { success: true };
      } catch (err: any) {
        return {
          success: false,
          error: err.message || 'Profile update failed',
        };
      }
    },
    [user],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!user) return { success: false, error: 'Not authenticated' };

      try {
        await apiRequest('/auth/me/change-password', {
          method: 'POST',
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        });
        return { success: true };
      } catch (err: any) {
        return {
          success: false,
          error: err.message || 'Failed to change password',
        };
      }
    },
    [user],
  );

  const hasPermission = useCallback(
    (requiredRole: UserRole | UserRole[]) => {
      if (!user) return false;
      if (Array.isArray(requiredRole)) {
        return requiredRole.some(
          (role) => ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[role],
        );
      }
      return ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[requiredRole];
    },
    [user],
  );

  const canEdit = useCallback(
    (module: string) => {
      if (!user) return false;

      const requiredPermissions = MODULE_PERMISSION_MAP[module] || [];
      if (requiredPermissions.length > 0 && user.permissions?.length) {
        return requiredPermissions.some((permission) =>
          user.permissions?.includes(permission),
        );
      }

      switch (user.role) {
        case 'admin':
          return true;
        case 'manager':
          return true;
        case 'scheduler':
          return ['scheduler', 'workorders', 'availability'].includes(module);
        case 'viewer':
          return false;
        default:
          return false;
      }
    },
    [user],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        register,
        updateProfile,
        changePassword,
        hasPermission,
        canEdit,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
