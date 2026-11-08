import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/lib/pagination';

export function usePaginationState(
  scope: string,
  total?: number,
  initialSize = DEFAULT_PAGE_SIZE,
) {
  const [pageSize, updateSize] = useState(initialSize);
  const key = JSON.stringify([scope, pageSize]);
  const [position, setPosition] = useState({ key, page: 1 });
  const page = position.key === key ? position.page : 1;
  const setPage = useCallback(
    (next: number) => {
      setPosition({ key, page: Math.max(1, Math.floor(next)) });
    },
    [key],
  );
  const setPageSize = useCallback(
    (next: number) => {
      if (
        !PAGE_SIZE_OPTIONS.some((size) => size === next) &&
        next !== initialSize
      )
        return;
      updateSize(next);
      setPosition({ key: JSON.stringify([scope, next]), page: 1 });
    },
    [scope, initialSize],
  );
  useEffect(() => {
    if (position.key !== key) setPosition({ key, page: 1 });
  }, [key, position.key]);
  useEffect(() => {
    if (total !== undefined && page > Math.max(1, Math.ceil(total / pageSize)))
      setPage(Math.max(1, Math.ceil(total / pageSize)));
  }, [total, page, pageSize, setPage]);
  return { page, setPage, pageSize, setPageSize };
}
