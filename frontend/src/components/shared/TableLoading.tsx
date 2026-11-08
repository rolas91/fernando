import { Loader2 } from 'lucide-react';

export default function TableLoading({
  label = 'Loading data…',
  variant = 'table',
  rows = 5,
  columns = 4,
  announce = true,
  className = '',
}: {
  label?: string;
  variant?: 'table' | 'inline';
  rows?: number;
  columns?: number;
  announce?: boolean;
  className?: string;
}) {
  const status = announce
    ? { role: 'status', 'aria-live': 'polite' as const }
    : {};
  const indicator = (
    <>
      <Loader2
        aria-hidden="true"
        className="h-5 w-5 shrink-0 text-primary motion-safe:animate-spin"
      />
      <span>{label}</span>
    </>
  );
  if (variant === 'inline') {
    return (
      <span
        {...status}
        className={`inline-flex min-w-0 items-center gap-2 text-sm text-gray-600 ${className}`}
      >
        {indicator}
      </span>
    );
  }
  return (
    <div
      {...status}
      aria-busy="true"
      className={`w-full min-w-0 py-5 ${className}`}
    >
      <div className="flex items-center justify-center gap-2 px-4 pb-5 text-sm text-gray-600">
        {indicator}
      </div>
      <div
        aria-hidden="true"
        className="divide-y divide-gray-100 motion-safe:animate-pulse"
      >
        {Array.from({ length: Math.max(1, Math.min(rows, 10)) }, (_, row) => (
          <div
            key={row}
            className="grid gap-4 px-4 py-3.5"
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, Math.min(columns, 12))}, minmax(0, 1fr))`,
            }}
          >
            {Array.from(
              { length: Math.max(1, Math.min(columns, 12)) },
              (_, column) => (
                <span
                  key={column}
                  className="block h-3 rounded bg-gray-200"
                  style={{ width: `${[75, 95, 60, 85][(row + column) % 4]}%` }}
                />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
