import { useEffect, useState } from 'react';
import { fetchShiftStatusCatalog, type ShiftStatusCatalogItem } from './db';

export function useShiftStatusCatalog() {
  const [items, setItems] = useState<ShiftStatusCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchShiftStatusCatalog()
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load statuses',
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const manualValues = new Set([
    'customer_pending',
    'dispatch_pending',
    'ready_to_notify',
    'shift_cancelled',
  ]);
  const automaticValues = new Set([
    'awaiting_response',
    'workers_confirmed',
    'shift_cancelled',
    'shift_completed',
    'pm_approved',
  ]);
  const manual = items.filter((s) => manualValues.has(s.value));
  const automatic = items.filter((s) => automaticValues.has(s.value));

  return { items, manual, automatic, loading, error };
}
