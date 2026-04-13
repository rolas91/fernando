export type UserAccessContext = {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
};

// Light Clean: port expone las operaciones que otros módulos necesitan.
// Implementación actual: AccessService (TypeORM).
export interface AccessPort {
  ensureRoleExists(roleKey: string, name?: string): Promise<unknown>;
  assignRoleToUser(userId: string, roleKey: string): Promise<UserAccessContext>;
  getUserAccessContext(userId: string): Promise<UserAccessContext>;
}
