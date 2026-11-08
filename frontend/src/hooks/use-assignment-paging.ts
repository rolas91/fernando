import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePaginationState } from './use-pagination-state';
import { useAuth } from '@/contexts/AuthContext';
import {
  scheduleScopeOptions,
  assignmentRecordsOptions,
  assignmentPageOptions,
  assignmentRecordOptions,
  conflictIndexOptions,
} from '@/lib/assignmentPaging';
export function useScheduleScope(from: string, to: string) {
  const { user } = useAuth();
  return useQuery({
    ...scheduleScopeOptions(user?.id || 'guest', from, to),
    enabled: Boolean(user && from && to),
  });
}
export function useAssignmentRecords(ids: string[]) {
  const { user } = useAuth();
  return useQuery({
    ...assignmentRecordsOptions(user?.id || 'guest', ids),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === user?.id ? previous : undefined,
    enabled: Boolean(user && ids.length),
  });
}
export function useCompleteAssignment(id?: string) {
  const { user } = useAuth();
  return useQuery({
    ...assignmentRecordOptions(user?.id || 'guest', id || ''),
    enabled: Boolean(user && id),
  });
}
export function useConflictAssignments() {
  const { user } = useAuth();
  const query = useQuery({
    ...conflictIndexOptions(user?.id || 'guest'),
    enabled: Boolean(user),
  });
  const [readyOwner, setReadyOwner] = useState<string>();
  useEffect(() => {
    if (query.isSuccess && !query.isFetching) setReadyOwner(user?.id);
  }, [query.isSuccess, query.isFetching, user?.id]);
  return { ...query, ready: Boolean(user && readyOwner === user.id) };
}
export const usePagePosition = usePaginationState;
export function useAssignmentPage(filters: Record<string, string>) {
  const { user } = useAuth();
  const key = JSON.stringify(filters);
  const position = usePagePosition(key);
  const query = useQuery({
    ...assignmentPageOptions(
      user?.id || 'guest',
      filters,
      position.page,
      position.pageSize,
    ),
    enabled: Boolean(user),
  });
  useEffect(() => {
    if (query.data && position.page > Math.max(1, query.data.meta.totalPages))
      position.setPage(Math.max(1, query.data.meta.totalPages));
  }, [query.data, position.page, position.setPage]);
  return { ...position, ...query };
}
