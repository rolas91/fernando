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
  scheduler: 'Schedule',
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
  certifications: {
    read: 'certifications.read',
    write: 'certifications.write',
  },
  clients: {
    read: 'clients.read',
    write: 'clients.write',
  },
  'commercial-catalog-items': {
    read: 'commercial-catalog-items.read',
    write: 'commercial-catalog-items.write',
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
  materials: {
    read: 'materials.read',
    write: 'materials.write',
  },
  notifications: {
    read: 'notifications.read',
    write: 'notifications.write',
  },
  projects: {
    read: 'projects.read',
    write: 'projects.write',
  },
  'project-types': {
    read: 'project-types.read',
    write: 'project-types.write',
  },
  shifts: {
    read: 'shifts.read',
    write: 'shifts.write',
  },
  skills: {
    read: 'skills.read',
    write: 'skills.write',
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
  'worker-roles': {
    read: 'worker-roles.read',
    write: 'worker-roles.write',
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

const mobileFieldPermissions: string[] = [
  'mobile.assignments.read',
  'mobile.shifts.read',
  'mobile.shifts.confirm',
  'mobile.timesheets.submit',
];

const mobileSupervisorPermissions: string[] = [
  ...mobileFieldPermissions,
  'mobile.incidents.submit',
  'mobile.work-orders.submit',
];

export const DEFAULT_PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'access.manage': 'Administrar roles y permisos',
  'access.read': 'Consultar roles y permisos',
  'mobile.assignments.read': 'Mobile: ver assignments asignados',
  'mobile.shifts.read': 'Mobile: ver shifts asignados',
  'mobile.shifts.confirm': 'Mobile: confirmar o declinar shifts',
  'mobile.timesheets.submit': 'Mobile: enviar timesheets',
  'mobile.incidents.submit': 'Mobile: enviar incident reports',
  'mobile.work-orders.submit': 'Mobile: enviar work orders',
  'users.read': 'Consultar usuarios',
  'users.write': 'Crear, editar y eliminar usuarios',
};

for (const [resource, permissions] of Object.entries(
  OPERATIONS_RESOURCE_PERMISSIONS,
)) {
  DEFAULT_PERMISSION_DESCRIPTIONS[permissions.read] = `Leer ${resource}`;
  DEFAULT_PERMISSION_DESCRIPTIONS[permissions.write] = `Editar ${resource}`;
}

DEFAULT_PERMISSION_DESCRIPTIONS[
  OPERATIONS_RESOURCE_PERMISSIONS['work-orders'].read
] = 'Leer asignaciones';
DEFAULT_PERMISSION_DESCRIPTIONS[
  OPERATIONS_RESOURCE_PERMISSIONS['work-orders'].write
] = 'Editar asignaciones';
DEFAULT_PERMISSION_DESCRIPTIONS[
  OPERATIONS_RESOURCE_PERMISSIONS['work-order-types'].read
] = 'Leer tipos de asignación';
DEFAULT_PERMISSION_DESCRIPTIONS[
  OPERATIONS_RESOURCE_PERMISSIONS['work-order-types'].write
] = 'Editar tipos de asignación';

export const DEFAULT_ROLE_GRANTS: Record<AppRoleKey, string[]> = {
  viewer: [
    ...allOperationsReadPermissions,
    ...mobileFieldPermissions,
  ],
  scheduler: [
    ...allOperationsReadPermissions,
    ...schedulerWritePermissions,
    ...mobileSupervisorPermissions,
  ],
  manager: [
    ...allOperationsReadPermissions,
    ...allOperationsWritePermissions,
    ...mobileSupervisorPermissions,
  ],
  admin: [
    ...allOperationsReadPermissions,
    ...allOperationsWritePermissions,
    ...mobileSupervisorPermissions,
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
