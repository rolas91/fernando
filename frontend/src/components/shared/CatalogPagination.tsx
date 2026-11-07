import type { PagedResult } from '@/lib/db';
export default function CatalogPagination({
  meta,
  page,
  onPage,
  busy,
}: {
  meta?: PagedResult<unknown>['meta'];
  page: number;
  onPage: (page: number) => void;
  busy: boolean;
}) {
  if (!meta) return null;
  const pages = Math.max(1, meta.totalPages);
  return (
    <nav
      aria-label="Catalog pages"
      className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-gray-600"
    >
      <span>
        {meta.total === 0
          ? 'No results'
          : `${(page - 1) * meta.limit + 1}–${Math.min(page * meta.limit, meta.total)} of ${meta.total}`}
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy || page <= 1}
          onClick={() => onPage(page - 1)}
          className="min-h-11 rounded-md border px-3 disabled:opacity-40"
        >
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button
          type="button"
          disabled={busy || page >= pages}
          onClick={() => onPage(page + 1)}
          className="min-h-11 rounded-md border px-3 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
