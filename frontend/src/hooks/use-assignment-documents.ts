import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  assignmentDocumentsOptions,
  scheduleSubmissionIndexOptions,
} from '@/lib/assignmentDocumentReads';
export function useAssignmentDocuments(workOrderId?: string) {
  const { user } = useAuth();
  return useQuery({
    ...assignmentDocumentsOptions(user?.id || 'guest', workOrderId || ''),
    enabled: Boolean(user?.id && workOrderId),
  });
}
export function useScheduleSubmissionIndex() {
  const { user } = useAuth();
  return useQuery({
    ...scheduleSubmissionIndexOptions(user?.id || 'guest'),
    enabled: Boolean(user?.id),
  });
}
