import type {
  Client,
  Project,
  WorkOrder,
  ActivityFeedItem,
  Worker,
} from './types';
import type { PagedResult } from './db';
import {
  fetchDashboardRead,
  fetchOperationsRead,
  fetchOperationsExport,
} from './db';
import { appDataKey, shouldRetryAppRead } from './appDataQueries';
export interface DashboardReadData {
  workOrders: WorkOrder[];
  projects: Project[];
  clients: Client[];
  activeWorkerCount: number;
  equipmentCount: number;
  assignedWorkers: Array<
    Pick<Worker, 'id' | 'firstName' | 'lastName' | 'type'>
  >;
  assignedWorkerCount: number;
  plannedEquipmentCount: number;
  todayPlannedEquipment: Array<[string, number]>;
  pendingTimesheets: number;
  openIncidents: number;
  activeJobs: number;
  activity: PagedResult<ActivityFeedItem>;
}
export interface WorkerReportRow {
  worker: Pick<Worker, 'id' | 'firstName' | 'lastName' | 'type'>;
  regular: number;
  ot: number;
  total: number;
  pay: number;
}
export interface ProjectReportRow {
  project: Pick<Project, 'id' | 'name' | 'number' | 'status' | 'city'>;
  orders: number;
  hours: number;
  cost: number;
}
export interface OperationsExportData {
  workerHours: WorkerReportRow[];
  projectSummary: ProjectReportRow[];
}
export interface OperationsReadData extends OperationsExportData {
  activeWorkers: number;
  totalHours: number;
  totalOT: number;
  activeJobs: number;
  maxWorkerHours: number;
  timesheetCount: number;
  timesheetStatusCounts: Record<string, number>;
  workerTotals: { regular: number; ot: number; total: number; pay: number };
  equipmentCounts: Record<string, number>;
  incidentCounts: { total: number; open: number };
  forms: {
    total: number;
    summary: Array<{
      template: { id: string; name: string; category: string };
      count: number;
    }>;
  };
  meta: PagedResult<unknown>['meta'];
}
export type ReportSection = 'overview' | 'worker_hours' | 'project_summary';
export function dashboardDay(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()),
    end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return {
    date: [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-'),
    activityFrom: start.toISOString(),
    activityTo: end.toISOString(),
  };
}
const policy = {
  staleTime: 30000,
  refetchOnWindowFocus: false,
  retry: shouldRetryAppRead,
};
export function dashboardReadOptions(
  owner: string,
  day: ReturnType<typeof dashboardDay>,
  activityPage: number,
  pageSize = 25,
) {
  return {
    ...policy,
    queryKey: [
      ...appDataKey(owner, 'workOrders'),
      'dashboard',
      day,
      activityPage,
      pageSize,
    ],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchDashboardRead(
        {
          ...day,
          activityPage: String(activityPage),
          activityLimit: String(pageSize),
        },
        signal,
      ),
  };
}
export function operationsReadOptions(
  owner: string,
  range: { start: string; end: string },
  section: ReportSection,
  page: number,
  pageSize = 25,
) {
  return {
    ...policy,
    queryKey: [
      ...appDataKey(owner, 'timesheets'),
      'reports',
      range,
      section,
      page,
      pageSize,
    ],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchOperationsRead(
        {
          from: range.start,
          to: range.end,
          section,
          page: String(page),
          limit: String(pageSize),
        },
        signal,
      ),
  };
}
export function operationsExportOptions(
  owner: string,
  range: { start: string; end: string },
  section: Exclude<ReportSection, 'overview'>,
) {
  return {
    ...policy,
    staleTime: 0,
    gcTime: 0,
    queryKey: [
      ...appDataKey(owner, 'timesheets'),
      'reports-export',
      range,
      section,
    ],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchOperationsExport(
        { from: range.start, to: range.end, section },
        signal,
      ),
  };
}
