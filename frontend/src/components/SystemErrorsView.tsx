import TableLoading from '@/components/shared/TableLoading';
import DataPagination from '@/components/shared/DataPagination';
import { usePaginationState } from '@/hooks/use-pagination-state';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, RefreshCw } from 'lucide-react';

type ErrorItem = {
  id: string;
  source: string;
  level: string;
  message: string;
  stack: string;
  context: string;
  path: string;
  method: string;
  statusCode: number | null;
  userId: string;
  requestId: string;
  status: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  resolvedBy: string;
  resolvedAt: string | null;
};
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token =
    localStorage.getItem('auth_token') || localStorage.getItem('dr_auth_token');
  const response = await fetch(
    `${import.meta.env.VITE_API_URL || ''}/api/system-errors${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? 'Only administrators can access system errors.'
        : 'Could not load or update system errors. Please try again.',
    );
  return response.json();
}

export default function SystemErrorsView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('pending');
  const [level, setLevel] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { page, setPage, pageSize, setPageSize } = usePaginationState(JSON.stringify([user?.id, source, status, level, from, to]), undefined, 30);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const isAdmin = user?.role === 'admin';
  const query = useQuery({
    queryKey: [
      'system-errors',
      source,
      status,
      level,
      from,
      to,
      page,
      pageSize,
      user?.id,
    ],
    enabled: isAdmin,
    retry: false,
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (source) params.set('source', source);
      if (status) params.set('status', status);
      if (level) params.set('level', level);
      if (from) params.set('from', new Date(`${from}T00:00:00`).toISOString());
      if (to) params.set('to', new Date(`${to}T23:59:59.999`).toISOString());
      return api<{ items: ErrorItem[]; total: number; pageSize: number }>(
        `?${params}`,
      );
    },
  });
  useEffect(() => {
    setPage(1);
  }, [source, status, level, from, to]);
  useEffect(() => {
    if (query.data && page > Math.max(1, Math.ceil(query.data.total / pageSize))) setPage(Math.max(1, Math.ceil(query.data.total / pageSize)));
  }, [query.data, page, pageSize, setPage]);
  if (!isAdmin)
    return (
      <div className="p-6" role="alert">
        Only administrators can access system errors.
      </div>
    );
  const changeStatus = async (item: ErrorItem) => {
    setSaving(item.id);
    setNotice('');
    try {
      await api(`/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: item.status === 'resolved' ? 'pending' : 'resolved',
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ['system-errors'] });
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setSaving(null);
    }
  };
  const date = (value: string) => new Date(value).toLocaleString();
  const control = 'rounded-md border border-gray-300 bg-white p-2 text-sm';
  return (
    <section className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <AlertTriangle size={24} /> System errors
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Backend and frontend reports · Admin access · 30-day retention
          </p>
        </div>
        <button
          className={control + ' flex items-center gap-2'}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw
            size={16}
            className={query.isFetching ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>
      <div className="flex flex-wrap gap-3 rounded-lg border bg-white p-4">
        <label className="grid gap-1 text-sm">
          Source
          <select
            className={control}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">All sources</option>
            <option>BE</option>
            <option>FE</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Status
          <select
            className={control}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Severity
          <select
            className={control}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="">All levels</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          From
          <input
            className={control}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          To
          <input
            className={control}
            type="date"
            min={from || undefined}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {(query.error || notice) && (
        <p
          className="rounded border border-red-200 bg-red-50 p-3 text-red-700"
          role="alert"
        >
          {notice || (query.error as Error)?.message}
        </p>
      )}
      {query.isLoading && <TableLoading label="Loading errors…" />}
      {!query.isLoading && query.isFetching && <TableLoading variant="inline" label="Updating errors…" />}
      {query.data && (
        <>
          <p className="text-sm text-gray-600">
            {query.data.total} grouped reports. Repeated errors increase the
            count and reopen resolved reports.
          </p>
          {!query.data.items.length && (
            <div className="rounded-lg border bg-white p-10 text-center text-gray-500">
              No errors match these filters.
            </div>
          )}
          <div className="space-y-3">
            {query.data.items.map((item) => (
              <article
                key={item.id}
                className="min-w-0 rounded-lg border bg-white p-4"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-gray-100 px-2 py-1 font-semibold">
                      {item.source}
                    </span>
                    <span
                      className={
                        item.level === 'error'
                          ? 'text-red-700'
                          : 'text-amber-700'
                      }
                    >
                      {item.level === 'error' ? 'Error' : 'Warning'}
                    </span>
                    <span>{item.context || 'Application'}</span>
                    <span>×{item.occurrences}</span>
                    <span>
                      {item.status === 'pending' ? 'Pending' : 'Resolved'}
                    </span>
                  </div>
                  <button
                    className={control}
                    disabled={saving !== null}
                    onClick={() => void changeStatus(item)}
                  >
                    {saving === item.id
                      ? 'Saving…'
                      : item.status === 'resolved'
                        ? 'Reopen'
                        : 'Mark resolved'}
                  </button>
                </div>
                <p className="my-3 whitespace-pre-wrap break-words font-medium">
                  {item.message}
                </p>
                <p className="break-all text-xs text-gray-500">
                  Last seen: {date(item.lastSeen)}
                  {item.path && ` · ${item.method} ${item.path}`}
                  {item.statusCode && ` · HTTP ${item.statusCode}`}
                </p>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-gray-600">
                    Technical details
                  </summary>
                  <dl className="my-3 grid gap-1 break-all text-xs">
                    <div>First seen: {date(item.firstSeen)}</div>
                    <div>User ID: {item.userId || 'Unknown / anonymous'}</div>
                    <div>Request ID: {item.requestId || '—'}</div>
                    {item.resolvedAt && (
                      <div>
                        Resolved: {date(item.resolvedAt)} · {item.resolvedBy}
                      </div>
                    )}
                  </dl>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-3 text-xs">
                    {item.stack || 'No stack trace available.'}
                  </pre>
                </details>
              </article>
            ))}
          </div>
          <DataPagination page={page} total={query.data.total} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} busy={query.isFetching} itemLabel="errors" />
        </>
      )}
    </section>
  );
}
