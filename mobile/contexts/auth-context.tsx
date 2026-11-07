import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  loginRequest,
  type LoginPayload,
  type LoginResult,
} from '@/lib/auth-service';
import { AUTH_MESSAGES, subscribeToSessionExpired } from '@/lib/auth-errors';
import {
  registerDeviceForPush,
  setupPushTokenRefresh,
} from '@/lib/push-notifications-service';

export type UserRole = 'admin' | 'manager' | 'scheduler' | 'viewer';

const ROLE_PRIORITY: Record<UserRole, number> = {
  admin: 4,
  manager: 3,
  scheduler: 2,
  viewer: 1,
};

const ROLE_GRANTS: Record<UserRole, string[]> = {
  viewer: [
    'activity-feed.read',
    'availability-requests.read',
    'clients.read',
    'company-settings.read',
    'equipment.read',
    'form-submissions.read',
    'form-templates.read',
    'incidents.read',
    'notifications.read',
    'projects.read',
    'shifts.read',
    'status-catalog.read',
    'timesheets.read',
    'work-order-types.read',
    'work-orders.read',
    'workers.read',
    'mobile.assignments.read',
    'mobile.shifts.read',
    'mobile.shifts.confirm',
    'mobile.timesheets.submit',
  ],
  scheduler: [
    'activity-feed.write',
    'availability-requests.write',
    'form-submissions.write',
    'incidents.write',
    'notifications.write',
    'shifts.write',
    'timesheets.write',
    'work-orders.write',
    'mobile.incidents.submit',
    'mobile.work-orders.submit',
  ],
  manager: [
    'activity-feed.write',
    'availability-requests.write',
    'clients.write',
    'company-settings.write',
    'equipment.write',
    'form-submissions.write',
    'form-templates.write',
    'incidents.write',
    'notifications.write',
    'projects.write',
    'shifts.write',
    'status-catalog.write',
    'timesheets.write',
    'work-order-types.write',
    'work-orders.write',
    'workers.write',
    'mobile.incidents.submit',
    'mobile.work-orders.submit',
  ],
  admin: ['access.manage', 'access.read', 'users.read', 'users.write'],
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roles: string[];
  permissions: string[];
};

type AuthContextValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
  user: AuthUser | null;
  authNotice: string | null;
  clearAuthNotice: () => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: UserRole) => boolean;
  canRead: (resource: string) => boolean;
  canWrite: (resource: string) => boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
};

const AUTH_TOKEN_KEY = 'dr_mobile_auth_token';
const AUTH_USER_KEY = 'dr_mobile_auth_user';
const memoryStorage = new Map<string, string>();

function asUserRole(value: unknown): UserRole {
  return value === 'admin' ||
    value === 'manager' ||
    value === 'scheduler' ||
    value === 'viewer'
    ? value
    : 'viewer';
}

function permissionsForRole(role: UserRole) {
  const base = new Set<string>(ROLE_GRANTS.viewer);
  if (ROLE_PRIORITY[role] >= ROLE_PRIORITY.scheduler) {
    ROLE_GRANTS.scheduler.forEach((permission) => base.add(permission));
  }
  if (ROLE_PRIORITY[role] >= ROLE_PRIORITY.manager) {
    ROLE_GRANTS.manager.forEach((permission) => base.add(permission));
  }
  if (ROLE_PRIORITY[role] >= ROLE_PRIORITY.admin) {
    ROLE_GRANTS.admin.forEach((permission) => base.add(permission));
  }
  return [...base].sort();
}

function normalizeUser(raw: Partial<AuthUser> | LoginResult['user']): AuthUser {
  const role = asUserRole(raw.role);
  const roles =
    Array.isArray(raw.roles) && raw.roles.length > 0
      ? raw.roles.filter((item): item is string => typeof item === 'string')
      : [role];
  const permissions =
    Array.isArray(raw.permissions) && raw.permissions.length > 0
      ? raw.permissions.filter(
          (item): item is string => typeof item === 'string',
        )
      : permissionsForRole(role);

  return {
    id: String(raw.id || ''),
    name: String(raw.name || 'DR User'),
    email: String(raw.email || ''),
    role,
    roles,
    permissions,
  };
}

async function safeGetItem(key: string) {
  try {
    const value = await AsyncStorage.getItem(key);
    if (value !== null) memoryStorage.set(key, value);
    return value ?? memoryStorage.get(key) ?? null;
  } catch (error) {
    console.warn(
      `[Auth] storage get failed (${key}). Using memory fallback.`,
      error,
    );
    return memoryStorage.get(key) ?? null;
  }
}

async function safeSetItem(key: string, value: string) {
  memoryStorage.set(key, value);
  try {
    await AsyncStorage.setItem(key, value);
  } catch (error) {
    console.warn(
      `[Auth] storage set failed (${key}). Kept in memory only.`,
      error,
    );
  }
}

async function safeRemoveItem(key: string) {
  memoryStorage.delete(key);
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.warn(
      `[Auth] storage remove failed (${key}). Removed from memory only.`,
      error,
    );
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const tokenRefreshUnsub = useRef<(() => void) | null>(null);

  const registerPushToken = useCallback((authToken: string) => {
    registerDeviceForPush(authToken).catch((error) => {
      console.warn('[Push] token registration skipped.', error);
    });
  }, []);

  const setupPushListeners = useCallback((authToken: string) => {
    tokenRefreshUnsub.current?.();
    tokenRefreshUnsub.current = setupPushTokenRefresh(authToken);
  }, []);

  useEffect(
    () =>
      subscribeToSessionExpired(() => {
        void Promise.all([
          safeRemoveItem(AUTH_TOKEN_KEY),
          safeRemoveItem(AUTH_USER_KEY),
        ]);
        tokenRefreshUnsub.current?.();
        setToken(null);
        setUser(null);
        setAuthNotice(AUTH_MESSAGES.sessionExpired);
      }),
    [],
  );

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          safeGetItem(AUTH_TOKEN_KEY),
          safeGetItem(AUTH_USER_KEY),
        ]);
        if (!mounted) return;
        if (storedToken) {
          setToken(storedToken);
          registerPushToken(storedToken);
          setupPushListeners(storedToken);
        }
        if (storedUser)
          setUser(normalizeUser(JSON.parse(storedUser) as Partial<AuthUser>));
      } catch (error) {
        console.warn('[Auth] bootstrap failed:', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void bootstrap();
    return () => {
      mounted = false;
      tokenRefreshUnsub.current?.();
    };
  }, [registerPushToken, setupPushListeners]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      setAuthNotice(null);
      const result: LoginResult = await loginRequest(payload);
      const nextUser = normalizeUser(result.user);
      await Promise.all([
        safeSetItem(AUTH_TOKEN_KEY, result.token),
        safeSetItem(AUTH_USER_KEY, JSON.stringify(nextUser)),
      ]);
      setToken(result.token);
      setUser(nextUser);
      registerPushToken(result.token);
      setupPushListeners(result.token);
    },
    [registerPushToken, setupPushListeners],
  );

  const logout = useCallback(async () => {
    await Promise.all([
      safeRemoveItem(AUTH_TOKEN_KEY),
      safeRemoveItem(AUTH_USER_KEY),
    ]);
    setToken(null);
    setUser(null);
    setAuthNotice(null);
  }, []);

  const clearAuthNotice = useCallback(() => setAuthNotice(null), []);

  const hasPermission = useCallback(
    (permission: string) => Boolean(user?.permissions.includes(permission)),
    [user],
  );

  const hasRole = useCallback(
    (role: UserRole) =>
      Boolean(user && ROLE_PRIORITY[user.role] >= ROLE_PRIORITY[role]),
    [user],
  );

  const canRead = useCallback(
    (resource: string) => hasPermission(`${resource}.read`),
    [hasPermission],
  );

  const canWrite = useCallback(
    (resource: string) => hasPermission(`${resource}.write`),
    [hasPermission],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      isAuthenticated: !!token,
      token,
      user,
      authNotice,
      clearAuthNotice,
      hasPermission,
      hasRole,
      canRead,
      canWrite,
      login,
      logout,
    }),
    [
      isLoading,
      token,
      user,
      authNotice,
      clearAuthNotice,
      hasPermission,
      hasRole,
      canRead,
      canWrite,
      login,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
