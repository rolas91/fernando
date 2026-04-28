export const APP_ROLE_KEYS = [
  'viewer',
  'scheduler',
  'manager',
  'admin',
] as const;

export type AppRoleKey = (typeof APP_ROLE_KEYS)[number];

export const APP_ROLE_NAMES: Record<AppRoleKey, string> = {
  admin: 'Admin',
  manager: 'Manager',
  scheduler: 'Scheduler',
  viewer: 'Viewer',
};

export const APP_ROLE_PRIORITY: Record<AppRoleKey, number> = {
  admin: 4,
  manager: 3,
  scheduler: 2,
  viewer: 1,
};

export const OPERATIONS_RESOURCE_PERMISSIONS = {
  'activity-feed': {
    read: 'activity-feed.read',
    write: 'activity-feed.write',
  },
  'availability-requests': {
    read: 'availability-requests.read',
    write: 'availability-requests.write',
  },
  clients: {
    read: 'clients.read',
    write: 'clients.write',
  },
  'company-settings': {
    read: 'company-settings.read',
    write: 'company-settings.write',
  },
  equipment: {
    read: 'equipment.read',
    write: 'equipment.write',
  },
  'form-submissions': {
    read: 'form-submissions.read',
    write: 'form-submissions.write',
  },
  'form-templates': {
    read: 'form-templates.read',
    write: 'form-templates.write',
  },
  incidents: {
    read: 'incidents.read',
    write: 'incidents.write',
  },
  notifications: {
    read: 'notifications.read',
    write: 'notifications.write',
  },
  projects: {
    read: 'projects.read',
    write: 'projects.write',
  },
  shifts: {
    read: 'shifts.read',
    write: 'shifts.write',
  },
  'status-catalog': {
    read: 'status-catalog.read',
    write: 'status-catalog.write',
  },
  timesheets: {
    read: 'timesheets.read',
    write: 'timesheets.write',
  },
  'work-order-types': {
    read: 'work-order-types.read',
    write: 'work-order-types.write',
  },
  'work-orders': {
    read: 'work-orders.read',
    write: 'work-orders.write',
  },
  workers: {
    read: 'workers.read',
    write: 'workers.write',
  },
} as const;

const allOperationsReadPermissions = Object.values(
  OPERATIONS_RESOURCE_PERMISSIONS,
).map((permission) => permission.read);

const allOperationsWritePermissions = Object.values(
  OPERATIONS_RESOURCE_PERMISSIONS,
).map((permission) => permission.write);

const schedulerWritePermissions: string[] = [
  OPERATIONS_RESOURCE_PERMISSIONS['activity-feed'].write,
  OPERATIONS_RESOURCE_PERMISSIONS['availability-requests'].write,
  OPERATIONS_RESOURCE_PERMISSIONS['form-submissions'].write,
  OPERATIONS_RESOURCE_PERMISSIONS.incidents.write,
  OPERATIONS_RESOURCE_PERMISSIONS.notifications.write,
  OPERATIONS_RESOURCE_PERMISSIONS.shifts.write,
  OPERATIONS_RESOURCE_PERMISSIONS.timesheets.write,
  OPERATIONS_RESOURCE_PERMISSIONS['work-orders'].write,
];

export const DEFAULT_PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'access.manage': 'Administrar roles y permisos',
  'access.read': 'Consultar roles y permisos',
  'users.read': 'Consultar usuarios',
  'users.write': 'Crear, editar y eliminar usuarios',
};

for (const [resource, permissions] of Object.entries(
  OPERATIONS_RESOURCE_PERMISSIONS,
)) {
  DEFAULT_PERMISSION_DESCRIPTIONS[permissions.read] = `Leer ${resource}`;
  DEFAULT_PERMISSION_DESCRIPTIONS[permissions.write] = `Editar ${resource}`;
}

export const DEFAULT_ROLE_GRANTS: Record<AppRoleKey, string[]> = {
  viewer: [...allOperationsReadPermissions],
  scheduler: [...allOperationsReadPermissions, ...schedulerWritePermissions],
  manager: [...allOperationsReadPermissions, ...allOperationsWritePermissions],
  admin: [
    ...allOperationsReadPermissions,
    ...allOperationsWritePermissions,
    'access.manage',
    'access.read',
    'users.read',
    'users.write',
  ],
};

export function derivePrimaryRole(roleKeys: string[]): AppRoleKey {
  let resolved: AppRoleKey = 'viewer';
  let highest = APP_ROLE_PRIORITY[resolved];

  for (const roleKey of roleKeys) {
    if (!(roleKey in APP_ROLE_PRIORITY)) continue;
    const candidate = roleKey as AppRoleKey;
    const priority = APP_ROLE_PRIORITY[candidate];
    if (priority > highest) {
      resolved = candidate;
      highest = priority;
    }
  }

  return resolved;
}
