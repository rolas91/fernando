import type { PageView } from './types';
import type { AppResource, AppDataRange } from './appDataQueries';
export const SHELL_RESOURCES: readonly AppResource[] = [
  'settings',
  'notifications',
  'timesheetSummary',
];
export const SHELL_OPTIONAL_RESOURCES: readonly AppResource[] = [
  'workOrders',
  'projects',
];
export const PAGED_PAGE_RESOURCES: Partial<
  Record<PageView, readonly AppResource[]>
> = {
  scheduler: ['formSubmissions', 'workOrders'],
  workorders: ['formSubmissions', 'workOrders'],
  dashboard: ['projects', 'clients'],
  shifts: ['workOrders', 'projects', 'clients', 'formSubmissions'],
  clients: ['clients'],
  equipment: ['equipment'],
  materials: ['materials'],
  workers: ['workers'],
  projects: ['projects', 'clients'],
  forms: ['formSubmissions', 'projects', 'workers', 'workOrders'],
  incidents: ['incidents', 'projects', 'workers'],
};
export const ON_DEMAND_PAGE_RESOURCES: Partial<
  Record<PageView, readonly AppResource[]>
> = {
  shifts: ['workers', 'equipment', 'materials'],
  projects: ['clients'],
  forms: ['workers', 'projects', 'workOrders', 'timesheets'],
  incidents: ['workOrders', 'formSubmissions'],
};
export const PAGE_RESOURCES: Record<PageView, readonly AppResource[]> = {
  dashboard: ['settings'],
  scheduler: [
    'availabilityRequests',
    'certifications',
    'clients',
    'equipment',
    'formTemplates',
    'materials',
    'notifications',
    'projects',
    'settings',
    'shifts',
    'workOrderTypes',
    'workerRoles',
    'workers',
  ],
  shifts: ['settings', 'shifts', 'formTemplates'],
  workorders: [
    'certifications',
    'clients',
    'equipment',
    'formTemplates',
    'projects',
    'settings',
    'shifts',
    'workOrderTypes',
    'workerRoles',
    'workers',
  ],
  workOrdersModule: [
    'clients',
    'commercialCatalogItems',
    'commercialWorkOrders',
    'projects',
  ],
  readyToBill: ['commercialInvoices', 'commercialWorkOrders'],
  itemsCatalog: ['commercialCatalogItems'],
  projects: ['projectTypes', 'statusCatalog'],
  workers: ['certifications', 'settings', 'skills', 'workerRoles'],
  equipment: ['settings', 'statusCatalog'],
  materials: ['settings', 'statusCatalog'],
  timesheets: [],
  forms: ['formTemplates', 'settings', 'statusCatalog'],
  clients: [],
  incidents: ['formTemplates', 'statusCatalog'],
  reports: [],
  settings: [
    'certifications',
    'formTemplates',
    'projectTypes',
    'settings',
    'shifts',
    'skills',
    'statusCatalog',
    'workOrderTypes',
    'workerRoles',
    'workers',
  ],
  profile: [],
  availability: [
    'availabilityRequests',
    'statusCatalog',
    'workOrders',
    'workers',
  ],
  systemErrors: [],
};
export function resourcesForPage(page: PageView): ReadonlySet<AppResource> {
  const resources = new Set([...SHELL_RESOURCES, ...PAGE_RESOURCES[page]]);
  if (resources.has('timesheets')) resources.delete('timesheetSummary');
  return resources;
}
export function rangeForPage(
  page: PageView,
  today: string,
): AppDataRange | undefined {
  // Scoped Schedule/Assignments use dedicated reads; legacy callers retain the complete default.
  return page === 'dashboard' ? { from: today, to: today } : undefined;
}
export function localDateKey(date = new Date()): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
