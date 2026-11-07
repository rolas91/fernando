export function DocumentReadNotice({
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
      className="p-3 text-sm text-gray-600"
    >
      {failed ? (
        <>
          Unable to load form responses.{' '}
          <button
            type="button"
            className="text-primary underline"
            onClick={() => void retry()}
          >
            Retry
          </button>
        </>
      ) : (
        'Loading form responses…'
      )}
    </div>
  );
}
