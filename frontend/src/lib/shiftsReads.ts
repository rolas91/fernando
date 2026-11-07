import type {
  WorkOrder,
  Shift,
  Project,
  Client,
  FormSubmission,
} from './types';
import type { PagedResult } from './db';
import {
  fetchShiftsPage,
  fetchShiftsMetrics,
  fetchShiftReadDetail,
} from './db';
import { appDataKey, shouldRetryAppRead } from './appDataQueries';
export interface ShiftRow {
  workOrder: WorkOrder;
  shift: Shift;
}
export interface ShiftsPage {
  rows: ShiftRow[];
  columns?: Record<string, PagedResult<unknown>['meta']>;
  projects: Project[];
  clients: Client[];
  meta: PagedResult<unknown>['meta'];
}
export interface ShiftsMetrics {
  statusCounts: Record<string, number>;
  projects: Array<Pick<Project, 'id' | 'number' | 'name'>>;
  approvedProjectIds: string[];
}
export interface ShiftReadDetail {
  workOrder: WorkOrder;
  project: Project | null;
  client: Client | null;
  submissions: FormSubmission[];
}
export interface ShiftsFilters {
  search: string;
  status: string;
  projectNumber: string;
  projectName: string;
  from?: string;
  to?: string;
}
const policy = {
  staleTime: 30000,
  refetchOnWindowFocus: false,
  retry: shouldRetryAppRead,
};
export function shiftsPageOptions(
  owner: string,
  filters: ShiftsFilters,
  page: number,
  mode: 'list' | 'calendar' | 'board' = 'list',
  pages: Record<string, number> = {},
) {
  const readMode = mode === 'board' ? 'board' : 'list';
  return {
    ...policy,
    queryKey: [
      ...appDataKey(owner, 'workOrders'),
      'shifts-page',
      filters,
      page,
      readMode,
      pages,
    ],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchShiftsPage(filters, page, signal, readMode, pages),
  };
}
export function shiftsMetricsOptions(owner: string, day: string) {
  return {
    ...policy,
    queryKey: [...appDataKey(owner, 'workOrders'), 'shifts-metrics', day],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchShiftsMetrics(signal),
  };
}
export function shiftReadDetailOptions(
  owner: string,
  workOrderId: string,
  shiftId: string,
) {
  return {
    ...policy,
    staleTime: 0,
    queryKey: [
      ...appDataKey(owner, 'workOrders'),
      'shift-detail',
      workOrderId,
      shiftId,
    ],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchShiftReadDetail(workOrderId, shiftId, signal),
  };
}
