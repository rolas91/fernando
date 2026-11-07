export function AssignmentPagination({
  page,
  total,
  setPage,
  loading = false,
}: {
  page: number;
  total: number;
  setPage: (page: number) => void;
  loading?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / 25));
  const numbers =
    pages <= 5
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
  return (
    <nav
      aria-label="Assignment pages"
      className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-4 py-3 text-sm"
    >
      <span role="status">
        {total ? (page - 1) * 25 + 1 : 0}–{Math.min(page * 25, total)} of{' '}
        {total} assignments{loading ? ' · Loading…' : ''}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => setPage(page - 1)}
          className="rounded border px-3 py-1.5 disabled:opacity-40"
        >
          Previous
        </button>
        {numbers.map((number, index) => (
          <span key={number} className="flex items-center gap-2">
            {index > 0 && number > numbers[index - 1] + 1 && (
              <span aria-hidden="true">…</span>
            )}
            <button
              type="button"
              aria-label={'Page ' + number}
              aria-current={number === page ? 'page' : undefined}
              disabled={loading}
              onClick={() => setPage(number)}
              className={
                'rounded border px-3 py-1.5 disabled:opacity-40 ' +
                (number === page
                  ? 'border-red-600 bg-red-600 text-white'
                  : 'bg-white')
              }
            >
              {number}
            </button>
          </span>
        ))}
        <span className="sr-only">
          Page {page} of {pages}
        </span>
        <button
          type="button"
          disabled={page >= pages || loading}
          onClick={() => setPage(page + 1)}
          className="rounded border px-3 py-1.5 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
