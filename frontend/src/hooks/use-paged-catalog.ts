import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from './use-toast';
import { appDataKey } from '@/lib/appDataQueries';
import { fetchCatalogExport, type CatalogFilters } from '@/lib/db';
import {
  catalogActions,
  catalogReadOptions,
  type CatalogResource,
} from '@/lib/pagedCatalog';

const EMPTY_ROWS: never[] = [];

export function usePagedCatalog<T>(
  resource: CatalogResource,
  filters: CatalogFilters,
  enabled = true,
) {
  const { user } = useAuth();
  const client = useQueryClient();
  const { toast } = useToast();
  const active = useRef(true);
  const [search, setSearch] = useState(filters.search || '');
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(filters.search || ''), 250);
    return () => clearTimeout(timer);
  }, [filters.search]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, [user?.id]);
  const normalized = {
    search,
    status: filters.status || '',
    type: filters.type || '',
    sort: filters.sort || '',
    direction: filters.direction || '',
  };
  const filterKey = JSON.stringify(normalized);
  const [position, setPosition] = useState({ key: filterKey, page: 1 });
  const page = position.key === filterKey ? position.page : 1;
  useEffect(() => {
    setPosition((previous) =>
      previous.key === filterKey ? previous : { key: filterKey, page: 1 },
    );
  }, [filterKey]);
  const setPage = useCallback(
    (next: number) => setPosition({ key: filterKey, page: Math.max(1, next) }),
    [filterKey],
  );
  const query = useQuery({
    ...catalogReadOptions<T>(user?.id || 'guest', resource, page, normalized),
    enabled: Boolean(user) && enabled,
  });
  useEffect(() => {
    if (query.data && page > Math.max(1, query.data.meta.totalPages))
      setPage(Math.max(1, query.data.meta.totalPages));
  }, [query.data, page, setPage]);
  const refresh = async () => {
    if (!active.current) return;
    const keys =
      resource === 'formSubmissions'
        ? ([
            'formSubmissions',
            'incidents',
            'timesheets',
            'timesheetSummary',
            'workOrders',
          ] as const)
        : resource === 'incidents'
          ? (['incidents', 'formSubmissions'] as const)
          : [resource];
    await Promise.all(
      keys.map((key) =>
        client.cancelQueries({
          queryKey: appDataKey(user?.id || 'guest', key),
        }),
      ),
    );
    if (active.current)
      await Promise.all(
        keys.map((key) =>
          client.invalidateQueries({
            queryKey: appDataKey(user?.id || 'guest', key),
          }),
        ),
      );
  };
  const rows = query.data?.data || EMPTY_ROWS;
  const overrides = catalogActions(resource, rows, refresh);
  const reportError = (error: unknown) =>
    toast({
      title: 'Could not save changes',
      description: error instanceof Error ? error.message : 'Please try again.',
      variant: 'destructive',
    });
  const exportAll = async (): Promise<T[] | null> => {
    setExporting(true);
    try {
      const rows = await fetchCatalogExport<T>(resource, filters);
      return active.current ? rows : null;
    } catch (error) {
      toast({
        title: 'Could not export catalog',
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
    rows,
    meta: query.data?.meta,
    lookups: query.data?.lookups,
    projectCounts: query.data?.projectCounts || {},
    relatedClients: query.data?.relatedClients || EMPTY_ROWS,
    projectMetrics: query.data?.projectMetrics || {},
    page,
    setPage,
    refresh,
    overrides,
    exportAll,
    exporting,
    reportError,
  };
}
