import type { AppRoleKey } from '../access-policy';

export type UserAccessContext = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  avatarUrl: string;
  status: string;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
  role: AppRoleKey;
  roles: string[];
  permissions: string[];
};

export interface AccessPort {
  ensureRoleExists(roleKey: string, name?: string): Promise<unknown>;
  assignRoleToUser(userId: string, roleKey: string): Promise<UserAccessContext>;
  getUserAccessContext(userId: string): Promise<UserAccessContext>;
}
