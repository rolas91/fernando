import { appDataKey, shouldRetryAppRead } from './appDataQueries';
import { fetchAssignmentDocuments, fetchScheduleSubmissionIndex } from './db';
const policy = {
  staleTime: 30000,
  refetchOnWindowFocus: false,
  retry: shouldRetryAppRead,
};
export function scheduleSubmissionIndexOptions(owner: string) {
  return {
    ...policy,
    queryKey: [...appDataKey(owner, 'formSubmissions'), 'schedule-index'],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchScheduleSubmissionIndex(signal),
  };
}
export function assignmentDocumentsOptions(owner: string, workOrderId: string) {
  return {
    ...policy,
    queryKey: [
      ...appDataKey(owner, 'formSubmissions'),
      'assignment-documents',
      workOrderId,
    ],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchAssignmentDocuments(workOrderId, signal),
  };
}
