export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 25;

export function paginationRange(page: number, pageSize: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.max(1, Math.min(page, pages));
  return {
    pages,
    current,
    first: total ? (current - 1) * pageSize + 1 : 0,
    last: Math.min(current * pageSize, total),
  };
}

export function paginationNumbers(page: number, pages: number) {
  return pages <= 5
    ? Array.from({ length: pages }, (_, index) => index + 1)
    : [
        ...new Set([
          1,
          Math.max(1, page - 1),
          page,
          Math.min(pages, page + 1),
          pages,
        ]),
      ].sort((a, b) => a - b);
}
