import type { Project, Client, Worker } from './types';
import type { PagedResult, CatalogFilters } from './db';
import {
  fetchProjectCalendar,
  fetchProjectDetail,
  fetchProjectRecord,
} from './db';
import { appDataKey, shouldRetryAppRead } from './appDataQueries';
export interface ProjectCalendarData {
  projects: Project[];
  clients: Array<Pick<Client, 'id' | 'name'>>;
  days: Array<{
    projectId: string;
    date: string;
    shifts: number;
    workers: number;
  }>;
}
export interface ProjectAssignmentSummary {
  id: string;
  title: string;
  orderNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  shiftCount: number;
  assigned: number;
  required: number;
}
export interface ProjectDetailData {
  project: Project;
  client: Pick<Client, 'id' | 'name'> | null;
  workers: Array<Pick<Worker, 'id' | 'firstName' | 'lastName' | 'type'>>;
  workerCount: number;
  assignments: PagedResult<ProjectAssignmentSummary>;
}
const policy = {
  staleTime: 30000,
  refetchOnWindowFocus: false,
  retry: shouldRetryAppRead,
};
export function projectCalendarOptions(
  user: string,
  from: string,
  to: string,
  filters: CatalogFilters,
) {
  return {
    ...policy,
    queryKey: [...appDataKey(user, 'projects'), 'calendar', from, to, filters],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchProjectCalendar(from, to, filters, signal),
  };
}
export function projectDetailOptions(
  user: string,
  id: string | null,
  page: number,
) {
  return {
    ...policy,
    queryKey: [...appDataKey(user, 'projects'), 'detail', id, page],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchProjectDetail(id!, page, signal),
  };
}
export function projectRecordOptions(user: string, id: string | null) {
  return {
    ...policy,
    queryKey: [...appDataKey(user, 'projects'), 'record', id],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchProjectRecord(id!, signal),
  };
}

// A dialog captures its initial fields once; prefer the freshest complete record
// already visible in a scoped read over an older individual-record cache.
export function latestProjectSnapshot(
  id: string | null,
  sources: Array<{ projects: readonly Project[]; updatedAt: number }>,
): Project | undefined {
  if (!id) return undefined;
  let result: Project | undefined;
  let newest = -1;
  for (const source of sources) {
    const project = source.projects.find((item) => item.id === id);
    if (project && source.updatedAt >= newest) {
      result = project;
      newest = source.updatedAt;
    }
  }
  return result;
}
