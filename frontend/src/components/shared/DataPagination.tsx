import {
  PAGE_SIZE_OPTIONS,
  paginationNumbers,
  paginationRange,
} from '@/lib/pagination';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import TableLoading from './TableLoading';

export default function DataPagination({
  page,
  total,
  pageSize,
  onPage,
  onPageSize,
  busy = false,
  itemLabel = 'records',
  className = '',
}: {
  page: number;
  total?: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  busy?: boolean;
  itemLabel?: string;
  className?: string;
}) {
  const range = paginationRange(page, pageSize, total ?? 0);
  const numbers = paginationNumbers(range.current, range.pages);
  const sizes = [...new Set<number>([...PAGE_SIZE_OPTIONS, pageSize])].sort(
    (a, b) => a - b,
  );
  const button =
    'min-h-11 min-w-11 rounded-md border border-gray-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <nav
      aria-label={`${itemLabel} pagination`}
      aria-busy={busy}
      className={`data-pagination shrink-0 bg-white px-4 py-3 text-sm text-gray-700 ${className}`}
    >
      <div className="data-pagination__layout">
        <div role="status" aria-live="polite" className="min-w-0 tabular-nums">
          {total === undefined
            ? !busy && 'Results unavailable'
            : `${range.first}–${range.last} of ${total} ${itemLabel}`}
          {busy && (
            <TableLoading
              variant="inline"
              label="Loading…"
              announce={false}
              className={total === undefined ? '' : 'ml-2'}
            />
          )}
        </div>
        <label className="data-pagination__size flex items-center gap-2">
          <span>Rows per page</span>
          <select
            value={pageSize}
            disabled={busy}
            onChange={(event) => onPageSize(Number(event.target.value))}
            className="min-h-11 rounded-md border border-gray-200 bg-white px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:opacity-40"
          >
            {sizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="data-pagination__navigation">
          <button
            type="button"
            aria-label="Previous"
            className={button}
            disabled={busy || total === undefined || range.current <= 1}
            onClick={() => onPage(range.current - 1)}
          >
            <ChevronLeft
              aria-hidden="true"
              size={16}
              className="data-pagination__compact-icon"
            />
            <span className="data-pagination__button-label">Previous</span>
          </button>
          {numbers.map((number, index) => (
            <span
              key={number}
              className={`flex items-center gap-2 ${number !== 1 && number !== range.pages && number !== range.current ? 'data-pagination__nearby' : ''}`}
            >
              {index > 0 && number > numbers[index - 1] + 1 && (
                <span aria-hidden="true" className="data-pagination__ellipsis">
                  …
                </span>
              )}
              <button
                type="button"
                aria-label={`Page ${number}`}
                aria-current={number === range.current ? 'page' : undefined}
                disabled={busy || total === undefined}
                onClick={() => onPage(number)}
                className={`${button} ${number === range.current ? 'border-red-600 bg-red-600 text-white' : 'bg-white'}`}
              >
                {number}
              </button>
            </span>
          ))}
          <span className="sr-only">
            Page {range.current} of {range.pages}
          </span>
          <button
            type="button"
            aria-label="Next"
            className={button}
            disabled={
              busy || total === undefined || range.current >= range.pages
            }
            onClick={() => onPage(range.current + 1)}
          >
            <span className="data-pagination__button-label">Next</span>
            <ChevronRight
              aria-hidden="true"
              size={16}
              className="data-pagination__compact-icon"
            />
          </button>
        </div>
      </div>
    </nav>
  );
}
