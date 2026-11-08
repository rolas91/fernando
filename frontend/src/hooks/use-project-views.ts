import { useEffect, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { usePaginationState } from './use-pagination-state';
import { useAuth } from '@/contexts/AuthContext';
import { catalogReadOptions } from '@/lib/pagedCatalog';
import {
  projectCalendarOptions,
  projectDetailOptions,
  projectRecordOptions,
} from '@/lib/projectViews';
import type { Project } from '@/lib/types';
import type { CatalogFilters } from '@/lib/db';

export function useProjectViews(input: {
  mode: 'list' | 'calendar' | 'board';
  filters: CatalogFilters;
  columns: string[];
  from: string;
  to: string;
  selected: string | null;
  editing: string | null;
}) {
  const { user } = useAuth();
  const owner = user?.id || 'guest';
  const [search, setSearch] = useState(input.filters.search || '');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.filters.search || ''), 250);
    return () => clearTimeout(timer);
  }, [input.filters.search]);
  const filters = {
    search,
    status: input.filters.status || '',
    type: input.filters.type || '',
    sort: input.filters.sort || '',
    direction: input.filters.direction || '',
  };
  const { pageSize: boardPageSize, setPageSize: setBoardPageSize } =
    usePaginationState(owner + JSON.stringify(filters));
  const filterKey = JSON.stringify([filters, boardPageSize]);
  const [boardPosition, setBoardPosition] = useState<{
    key: string;
    pages: Record<string, number>;
  }>({ key: filterKey, pages: {} });
  const boardPage = (status: string) =>
    boardPosition.key === filterKey ? boardPosition.pages[status] || 1 : 1;
  const setBoardPage = (status: string, page: number) =>
    setBoardPosition((previous) => ({
      key: filterKey,
      pages: {
        ...(previous.key === filterKey ? previous.pages : {}),
        [status]: Math.max(1, page),
      },
    }));
  const board = useQueries({
    queries: input.columns.map((status) => ({
      ...catalogReadOptions<Project>(
        owner,
        'projects',
        boardPage(status),
        {
          ...filters,
          status,
        },
        boardPageSize,
      ),
      enabled:
        Boolean(user) &&
        input.mode === 'board' &&
        (!filters.status || filters.status === status),
    })),
  });
  useEffect(() => {
    if (input.mode !== 'board') return;
    const pages: Record<string, number> = {};
    input.columns.forEach((status, index) => {
      const meta = board[index].data?.meta;
      if (meta && boardPage(status) > Math.max(1, meta.totalPages))
        pages[status] = Math.max(1, meta.totalPages);
    });
    if (Object.keys(pages).length)
      setBoardPosition((previous) => ({
        key: filterKey,
        pages: {
          ...(previous.key === filterKey ? previous.pages : {}),
          ...pages,
        },
      }));
  }, [
    input.mode,
    input.columns.join('|'),
    filterKey,
    board.map((query) => query.data?.meta.totalPages).join('|'),
    JSON.stringify(boardPosition),
  ]);
  const calendar = useQuery({
    ...projectCalendarOptions(owner, input.from, input.to, filters),
    enabled: Boolean(user) && input.mode === 'calendar',
  });
  const {
    page: detailPage,
    setPage: setDetailPage,
    pageSize: detailPageSize,
    setPageSize: setDetailPageSize,
  } = usePaginationState(owner + input.selected);
  const detail = useQuery({
    ...projectDetailOptions(owner, input.selected, detailPage, detailPageSize),
    enabled: Boolean(user && input.selected && input.mode !== 'board'),
  });
  useEffect(() => {
    if (
      detail.data &&
      detailPage > Math.max(1, detail.data.assignments.meta.totalPages)
    )
      setDetailPage(Math.max(1, detail.data.assignments.meta.totalPages));
  }, [detail.data, detailPage, input.selected]);
  const record = useQuery({
    ...projectRecordOptions(owner, input.editing),
    enabled: Boolean(user && input.editing),
  });
  return {
    board,
    boardPage,
    setBoardPage,
    boardPageSize,
    setBoardPageSize,
    calendar,
    detail,
    detailPage,
    setDetailPage,
    detailPageSize,
    setDetailPageSize,
    record,
  };
}
