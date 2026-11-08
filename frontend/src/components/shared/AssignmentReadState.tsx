import TableLoading from './TableLoading';

export function AssignmentReadState({
  pending,
  refreshing = false,
  failed,
  retry,
}: {
  pending: boolean;
  refreshing?: boolean;
  failed: boolean;
  retry: () => unknown;
}) {
  if (!failed && pending) return <TableLoading label="Loading assignments…" />;
  if (!failed && refreshing)
    return (
      <TableLoading
        variant="inline"
        label="Updating assignments…"
        className="px-4 py-3"
      />
    );
  if (!pending && !failed) return null;
  return (
    <div
      role={failed ? 'alert' : 'status'}
      className="p-4 text-sm text-gray-600"
    >
      {failed ? (
        <>
          Unable to load assignments.{' '}
          <button
            type="button"
            onClick={() => void retry()}
            className="text-primary underline"
          >
            Retry
          </button>
        </>
      ) : (
        'Loading assignments…'
      )}
    </div>
  );
}
