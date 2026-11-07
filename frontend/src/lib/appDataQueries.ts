import type { QueryClient } from '@tanstack/react-query';
import {
  ApiRequestError,
  fetchTable,
  fetchCompanySettings,
  fetchTimesheetSummary,
  fetchAvailabilityRequests,
} from './db';
import type { fetchAllData } from './db';
import type { AvailabilityRequest } from './types';

export type AppData = Omit<
  Awaited<ReturnType<typeof fetchAllData>>,
  'availabilityRequests'
> & {
  availabilityRequests: AvailabilityRequest[];
  timesheetSummary: { pending: number };
};
export type AppResource = keyof AppData;
export type AppDataRange = Readonly<{ from: string; to: string }>;
export const APP_RESOURCES = [
  {
    key: 'timesheetSummary',
    table: 'timesheet_summary',
    path: 'paged/timesheets/summary',
    label: 'Pending timesheets',
    staleTime: 30000,
  },
  {
    key: 'settings',
    table: 'company_settings',
    path: 'company-settings',
    label: 'Settings',
    staleTime: 900000,
  },
  {
    key: 'shifts',
    table: 'shifts',
    path: 'shifts',
    label: 'Shift types',
    staleTime: 900000,
  },
  {
    key: 'workOrderTypes',
    table: 'work_order_types',
    path: 'work-order-types',
    label: 'Assignment types',
    staleTime: 900000,
  },
  {
    key: 'projectTypes',
    table: 'project_types',
    path: 'project-types',
    label: 'Project types',
    staleTime: 900000,
  },
  {
    key: 'statusCatalog',
    table: 'status_catalog',
    path: 'status-catalog',
    label: 'Status catalog',
    staleTime: 900000,
  },
  {
    key: 'certifications',
    table: 'certifications',
    path: 'certifications',
    label: 'Certifications',
    staleTime: 900000,
  },
  {
    key: 'skills',
    table: 'skills',
    path: 'skills',
    label: 'Skills',
    staleTime: 900000,
  },
  {
    key: 'workerRoles',
    table: 'worker_roles',
    path: 'worker-roles',
    label: 'Worker roles',
    staleTime: 900000,
  },
  {
    key: 'workers',
    table: 'workers',
    path: 'workers',
    label: 'Workers',
    staleTime: 60000,
  },
  {
    key: 'equipment',
    table: 'equipment',
    path: 'equipment',
    label: 'Equipment',
    staleTime: 60000,
  },
  {
    key: 'materials',
    table: 'materials',
    path: 'materials',
    label: 'Materials',
    staleTime: 60000,
  },
  {
    key: 'clients',
    table: 'clients',
    path: 'clients',
    label: 'Clients',
    staleTime: 60000,
  },
  {
    key: 'projects',
    table: 'projects',
    path: 'projects',
    label: 'Projects',
    staleTime: 60000,
  },
  {
    key: 'workOrders',
    table: 'work_orders',
    path: 'work-orders',
    label: 'Assignments',
    staleTime: 15000,
  },
  {
    key: 'commercialCatalogItems',
    table: 'commercial_catalog_items',
    path: 'commercial-catalog-items',
    label: 'Commercial catalog',
    staleTime: 60000,
  },
  {
    key: 'commercialInvoices',
    table: 'commercial_invoices',
    path: 'commercial-work-orders/invoices',
    label: 'Invoices',
    staleTime: 30000,
  },
  {
    key: 'commercialWorkOrders',
    table: 'commercial_work_orders',
    path: 'commercial-work-orders',
    label: 'Commercial orders',
    staleTime: 30000,
  },
  {
    key: 'timesheets',
    table: 'timesheets',
    path: 'timesheets',
    label: 'Timesheets',
    staleTime: 30000,
  },
  {
    key: 'formTemplates',
    table: 'form_templates',
    path: 'form-templates',
    label: 'Form templates',
    staleTime: 300000,
  },
  {
    key: 'formSubmissions',
    table: 'form_submissions',
    path: 'form-submissions',
    label: 'Submitted forms',
    staleTime: 30000,
  },
  {
    key: 'incidents',
    table: 'incidents',
    path: 'incidents',
    label: 'Incidents',
    staleTime: 30000,
  },
  {
    key: 'notifications',
    table: 'notifications',
    path: 'notifications/web/me',
    label: 'Notifications',
    staleTime: 15000,
  },
  {
    key: 'activityFeed',
    table: 'activity_feed',
    path: 'activity-feed',
    label: 'Activity',
    staleTime: 30000,
  },
  {
    key: 'availabilityRequests',
    table: 'availability_requests',
    path: 'availability-requests',
    label: 'Availability',
    staleTime: 30000,
  },
] as const;

export function appDataKey(
  userId: string,
  resource?: AppResource,
  range?: AppDataRange,
) {
  if (!resource) return ['app-data', userId] as const;
  if (range && resource === 'workOrders')
    return [
      'app-data',
      userId,
      resource,
      'range',
      range.from,
      range.to,
    ] as const;
  return ['app-data', userId, resource] as const;
}

export function appResourceOptions(
  userId: string,
  resource: (typeof APP_RESOURCES)[number],
  range?: AppDataRange,
) {
  return {
    queryKey: appDataKey(userId, resource.key, range),
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<unknown> => {
      if (resource.key === 'timesheetSummary')
        return fetchTimesheetSummary(signal);
      if (resource.key === 'settings') return fetchCompanySettings(signal);
      if (resource.key === 'availabilityRequests')
        return fetchAvailabilityRequests(signal);
      const path =
        range && resource.key === 'workOrders'
          ? resource.path + '?' + new URLSearchParams(range).toString()
          : resource.path;
      return fetchTable(path, signal);
    },
    staleTime: resource.staleTime,
    // Schedule currently uses a refreshed assignment reference to reload computed
    // completion/status statistics, even when the assignment payload is unchanged.
    structuralSharing: resource.key !== 'workOrders',
    gcTime: 5 * 60 * 1000,
    retry: shouldRetryAppRead,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000),
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  };
}

// Preserve the existing state-setter contract used by mutation handlers.
// Cancel an older read before writing a successful mutation response.
export function updateAppResource<T>(
  client: QueryClient,
  userId: string,
  resource: AppResource,
  value: T | ((previous: T) => T),
  fallback: T,
) {
  const queryKey = appDataKey(userId, resource);
  if (resource === 'timesheets')
    void client.invalidateQueries({
      queryKey: appDataKey(userId, 'timesheetSummary'),
    });
  void client.cancelQueries({ queryKey });
  // A scoped assignment write must not create a fake complete history cache.
  const hasRootData = client.getQueryData(queryKey) !== undefined;
  if (resource !== 'workOrders' || hasRootData)
    client.setQueryData<T>(queryKey, (previous) =>
      typeof value === 'function'
        ? (value as (previous: T) => T)(previous ?? fallback)
        : value,
    );
  if (resource === 'workOrders') {
    type Orders = AppData['workOrders'];
    const change = value as unknown as Orders | ((previous: Orders) => Orders);
    for (const query of client.getQueryCache().findAll({ queryKey })) {
      const kind = String(query.queryKey[3]);
      if (
        ![
          'assignment-records',
          'assignments-page',
          'assignment-record',
          'assignment-shift-record',
        ].includes(kind)
      )
        continue;
      const current = query.state.data;
      if (!current) continue;
      const single =
        kind === 'assignment-record' || kind === 'assignment-shift-record';
      const rows = single
        ? [current as Orders[number]]
        : kind === 'assignments-page'
          ? (current as { data: Orders }).data
          : (current as Orders);
      const originalIds = new Set(rows.map((row) => row.id));
      const changed = typeof change === 'function' ? change([...rows]) : change;
      // Update existing complete records immediately without inserting a new row into unrelated pages.
      const next = changed.filter((row) => originalIds.has(row.id));
      client.setQueryData(
        query.queryKey,
        single
          ? (next[0] ?? null)
          : kind === 'assignments-page'
            ? { ...(current as object), data: next }
            : next,
      );
    }
  }
  void client.invalidateQueries({
    queryKey,
    predicate: (query) =>
      !hasRootData || query.queryKey.length > queryKey.length,
    refetchType: 'active',
  });
}

export function shouldRetryAppRead(
  failureCount: number,
  error: Error,
): boolean {
  return (
    failureCount < 2 &&
    error instanceof ApiRequestError &&
    (error.status === 0 || error.status >= 500)
  );
}
