import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const [position, setPosition] = useState({ date: day.date, page: 1 });
  const page = position.date === day.date ? position.page : 1;
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
    ...dashboardReadOptions(user?.id || 'guest', day, page),
    enabled: Boolean(user),
  });
  const setPage = (page: number) =>
    setPosition({ date: day.date, page: Math.max(1, page) });
  useEffect(() => {
    if (query.data && page > Math.max(1, query.data.activity.meta.totalPages))
      setPage(Math.max(1, query.data.activity.meta.totalPages));
  }, [query.data, page]);
  return { query, day, page, setPage };
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
  const key = JSON.stringify({ range, section }),
    [position, setPosition] = useState({ key, page: 1 }),
    page = position.key === key ? position.page : 1;
  const valid = Boolean(range.start && range.end && range.start <= range.end);
  const query = useQuery({
    ...operationsReadOptions(user?.id || 'guest', range, section, page),
    enabled: Boolean(user) && valid,
  });
  const setPage = (page: number) =>
    setPosition({ key, page: Math.max(1, page) });
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
  return { query, page, setPage, valid, exportAll, exporting };
}
