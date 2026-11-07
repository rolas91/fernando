import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { appDataKey } from '@/lib/appDataQueries';
import { localDateKey } from '@/lib/appDataPages';
import {
  shiftsPageOptions,
  shiftsMetricsOptions,
  type ShiftsFilters,
} from '@/lib/shiftsReads';
export function useShiftsRead(
  input: ShiftsFilters,
  mode: 'list' | 'calendar' | 'board' = 'list',
  active = true,
) {
  const { user } = useAuth(),
    client = useQueryClient();
  const [search, setSearch] = useState(input.search);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.search), 250);
    return () => clearTimeout(timer);
  }, [input.search]);
  const [day, setDay] = useState(localDateKey);
  useEffect(() => {
    const now = new Date(),
      midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = setTimeout(
      () => setDay(localDateKey()),
      midnight.getTime() - now.getTime() + 100,
    );
    return () => clearTimeout(timer);
  }, [day]);
  const filters = { ...input, search },
    key = JSON.stringify(filters);
  const [position, setPosition] = useState({ key, page: 1 }),
    page = position.key === key ? position.page : 1;
  const setPage = (page: number) =>
    setPosition({ key, page: Math.max(1, page) });
  const valid =
    (filters.from === undefined && filters.to === undefined) ||
    Boolean(filters.from && filters.to && filters.from <= filters.to);
  const [columnPosition, setColumnPosition] = useState<{
    key: string;
    pages: Record<string, number>;
  }>({ key, pages: {} });
  const columnPages = columnPosition.key === key ? columnPosition.pages : {};
  const columnPage = (status: string) =>
    Object.prototype.hasOwnProperty.call(columnPages, status)
      ? columnPages[status]
      : 1;
  const setColumnPage = (status: string, page: number) =>
    setColumnPosition((previous) => ({
      key,
      pages: {
        ...(previous.key === key ? previous.pages : {}),
        [status]: Math.max(1, page),
      },
    }));
  const query = useQuery({
    ...shiftsPageOptions(
      user?.id || 'guest',
      filters,
      mode === 'board' ? 1 : page,
      mode,
      mode === 'board' ? columnPages : {},
    ),
    enabled: Boolean(user) && valid && active,
  });
  const metrics = useQuery({
    ...shiftsMetricsOptions(user?.id || 'guest', day),
    enabled: Boolean(user) && active,
  });
  useEffect(() => {
    if (query.data && page > Math.max(1, query.data.meta.totalPages))
      setPage(Math.max(1, query.data.meta.totalPages));
  }, [query.data, page, key]);
  useEffect(() => {
    if (mode !== 'board' || !query.data?.columns) return;
    const updates = Object.fromEntries(
      Object.entries(query.data.columns)
        .filter(
          ([status, meta]) => columnPage(status) > Math.max(1, meta.totalPages),
        )
        .map(([status, meta]) => [status, Math.max(1, meta.totalPages)]),
    );
    if (Object.keys(updates).length)
      setColumnPosition((previous) => ({
        key,
        pages: { ...(previous.key === key ? previous.pages : {}), ...updates },
      }));
  }, [mode, query.data, key]);
  const refresh = async () => {
    if (!user) return;
    await client.cancelQueries({ queryKey: appDataKey(user.id, 'workOrders') });
    await client.invalidateQueries({
      queryKey: appDataKey(user.id, 'workOrders'),
    });
  };
  return {
    query,
    metrics,
    page,
    setPage,
    columnPage,
    setColumnPage,
    refresh,
    valid,
    scopeKey: key + '|' + mode + '|' + page,
  };
}
