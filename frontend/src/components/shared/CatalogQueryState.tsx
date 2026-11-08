import TableLoading from './TableLoading';

export default function CatalogQueryState({
  loading,
  refreshing = false,
  error,
  retry,
}: {
  loading: boolean;
  refreshing?: boolean;
  error: Error | null;
  retry: () => void;
}) {
  if (error)
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
      >
        <p>{error.message}</p>
        <button
          type="button"
          onClick={retry}
          className="min-h-11 rounded-md border border-red-300 px-3"
        >
          Retry loading
        </button>
      </div>
    );
  if (loading) return <TableLoading />;
  if (refreshing)
    return (
      <TableLoading
        variant="inline"
        label="Updating data…"
        className="px-4 py-3"
      />
    );
  return null;
}
