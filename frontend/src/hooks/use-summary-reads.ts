import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePaginationState } from './use-pagination-state';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from './use-toast';
import {
  dashboardDay,
  dashboardReadOptions,
  operationsReadOptions,
  operationsExportOptions,
  type ReportSection,
} from '@/lib/summaryReads';
export function useDashboardRead() {
  const { user } = useAuth();
  const [day, setDay] = useState(dashboardDay);
  const { page, setPage, pageSize, setPageSize } = usePaginationState(
    user?.id + day.date,
  );
  useEffect(() => {
    const now = new Date(),
      midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = setTimeout(
      () => setDay(dashboardDay()),
      midnight.getTime() - now.getTime() + 100,
    );
    return () => clearTimeout(timer);
  }, [day]);
  const query = useQuery({
    ...dashboardReadOptions(user?.id || 'guest', day, page, pageSize),
    enabled: Boolean(user),
  });
  useEffect(() => {
    if (query.data && page > Math.max(1, query.data.activity.meta.totalPages))
      setPage(Math.max(1, query.data.activity.meta.totalPages));
  }, [query.data, page]);
  return { query, day, page, setPage, pageSize, setPageSize };
}
export function useOperationsRead(
  range: { start: string; end: string },
  section: ReportSection,
) {
  const { user } = useAuth(),
    client = useQueryClient(),
    { toast } = useToast();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, [user?.id]);
  const key = JSON.stringify({ range, section });
  const { page, setPage, pageSize, setPageSize } = usePaginationState(
    user?.id + key,
  );
  const valid = Boolean(range.start && range.end && range.start <= range.end);
  const query = useQuery({
    ...operationsReadOptions(
      user?.id || 'guest',
      range,
      section,
      page,
      pageSize,
    ),
    enabled: Boolean(user) && valid,
  });
  useEffect(() => {
    if (query.data && page > Math.max(1, query.data.meta.totalPages))
      setPage(Math.max(1, query.data.meta.totalPages));
  }, [query.data, page, key]);
  const [exporting, setExporting] = useState(false);
  const exportAll = async (type: Exclude<ReportSection, 'overview'>) => {
    if (!user || !valid) return null;
    setExporting(true);
    try {
      const result = await client.fetchQuery(
        operationsExportOptions(user.id, range, type),
      );
      return active.current ? result : null;
    } catch (error) {
      if (active.current)
        toast({
          title: 'Could not export report',
          description:
            error instanceof Error ? error.message : 'Please try again.',
          variant: 'destructive',
        });
      return null;
    } finally {
      if (active.current) setExporting(false);
    }
  };
  return {
    query,
    page,
    setPage,
    pageSize,
    setPageSize,
    valid,
    exportAll,
    exporting,
  };
}
