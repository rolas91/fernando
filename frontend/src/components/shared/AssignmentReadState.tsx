export function AssignmentReadState({
  pending,
  failed,
  retry,
}: {
  pending: boolean;
  failed: boolean;
  retry: () => unknown;
}) {
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
