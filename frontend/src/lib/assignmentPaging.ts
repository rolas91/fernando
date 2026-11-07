import type { QueryClient } from '@tanstack/react-query';
import type { WorkOrder } from './types';
import { appDataKey, shouldRetryAppRead } from './appDataQueries';
import {
  fetchScheduleAssignmentScope,
  fetchCompleteAssignmentRecords,
  fetchAssignmentPage,
  fetchAssignmentRecord,
  fetchAssignmentConflictIndex,
  fetchAssignmentForShift,
} from './db';
const policy = {
  staleTime: 30000,
  refetchOnWindowFocus: false,
  retry: shouldRetryAppRead,
};
export const scheduleScopeOptions = (
  owner: string,
  from: string,
  to: string,
) => ({
  ...policy,
  structuralSharing: false as const,
  queryKey: [...appDataKey(owner, 'workOrders'), 'schedule-scope', from, to],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    fetchScheduleAssignmentScope(from, to, signal),
});
export const assignmentRecordsOptions = (owner: string, ids: string[]) => ({
  ...policy,
  structuralSharing: false as const,
  queryKey: [...appDataKey(owner, 'workOrders'), 'assignment-records', ids],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    fetchCompleteAssignmentRecords(ids, signal),
});
export const assignmentPageOptions = (
  owner: string,
  filters: Record<string, string>,
  page: number,
) => ({
  ...policy,
  structuralSharing: false as const,
  queryKey: [
    ...appDataKey(owner, 'workOrders'),
    'assignments-page',
    filters,
    page,
  ],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    fetchAssignmentPage(filters, page, signal),
});
export const assignmentRecordOptions = (owner: string, id: string) => ({
  ...policy,
  queryKey: [...appDataKey(owner, 'workOrders'), 'assignment-record', id],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    fetchAssignmentRecord(id, signal),
});
export const conflictIndexOptions = (owner: string) => ({
  ...policy,
  staleTime: 0,
  queryKey: [...appDataKey(owner, 'workOrders'), 'conflict-index'],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    fetchAssignmentConflictIndex(signal),
});
export function completeAssignmentSnapshot(
  client: QueryClient,
  owner: string,
  id: string,
): WorkOrder | undefined {
  const queries = client
    .getQueryCache()
    .findAll({ queryKey: appDataKey(owner, 'workOrders') })
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  for (const query of queries) {
    const kind = query.queryKey[3],
      data = query.state.data;
    const rows: WorkOrder[] =
      kind === 'assignment-records' || query.queryKey.length === 3
        ? (data as WorkOrder[] | undefined) || []
        : kind === 'assignments-page'
          ? (data as { data: WorkOrder[] } | undefined)?.data || []
          : ['assignment-record', 'assignment-shift-record'].includes(
                String(kind),
              ) && data
            ? [data as WorkOrder]
            : [];
    const found = rows?.find((row) => row.id === id);
    if (found) return found;
  }
  return undefined;
}
export function hasAssignmentRead(client: QueryClient, owner: string) {
  return client
    .getQueryCache()
    .findAll({ queryKey: appDataKey(owner, 'workOrders') })
    .some(
      (query) =>
        [
          'assignment-records',
          'assignments-page',
          'assignment-record',
          'assignment-shift-record',
          'schedule-scope',
        ].includes(String(query.queryKey[3])) && query.state.data !== undefined,
    );
}

export const assignmentShiftRecordOptions = (owner: string, id: string) => ({
  ...policy,
  queryKey: [...appDataKey(owner, 'workOrders'), 'assignment-shift-record', id],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    fetchAssignmentForShift(id, signal),
});
