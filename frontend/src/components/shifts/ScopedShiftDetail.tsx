import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { AppContextOverride } from '@/contexts/AppContext';
import { useDeferredAppData } from '@/hooks/use-deferred-app-data';
import { shiftReadDetailOptions, type ShiftRow } from '@/lib/shiftsReads';
import CatalogQueryState from '@/components/shared/CatalogQueryState';
import { ShiftDetailView } from './ShiftDetailView';
export default function ScopedShiftDetail({
  workOrderId,
  shiftId,
  statusLabel,
  onBack,
  onRefresh,
}: {
  workOrderId: string;
  shiftId: string;
  statusLabel: (row: ShiftRow) => string;
  onBack: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { user } = useAuth();
  const query = useQuery({
    ...shiftReadDetailOptions(user?.id || 'guest', workOrderId, shiftId),
    enabled: Boolean(user),
  });
  const related = useDeferredAppData(
    ['workers', 'equipment', 'materials'],
    true,
  );
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (
      !initialized &&
      query.data &&
      !query.isFetching &&
      !query.error &&
      related.ready
    )
      setInitialized(true);
  }, [initialized, query.data, query.isFetching, query.error, related.ready]);
  const data = query.data,
    shift = data?.workOrder.shifts.find((shift) => shift.id === shiftId);
  if (!initialized || !data || !shift)
    return (
      <div className="p-6 space-y-3">
        <CatalogQueryState
          loading={query.isFetching || related.loading}
          error={query.error || related.error}
          retry={() => {
            void query.refetch();
            related.retry();
          }}
        />
        <button onClick={onBack}>Back to shifts</button>
      </div>
    );
  return (
    <AppContextOverride
      value={{
        ...related.data,
        workOrders: [data.workOrder],
        projects: data.project ? [data.project] : [],
        clients: data.client ? [data.client] : [],
        formSubmissions: data.submissions,
        getProjectById: (id) =>
          data.project?.id === id ? data.project : undefined,
        getClientById: (id) =>
          data.client?.id === id ? data.client : undefined,
        getWorkerById: (id) =>
          related.data.workers?.find((worker) => worker.id === id),
      }}
    >
      <ShiftDetailView
        workOrder={data.workOrder}
        shift={shift}
        statusLabel={statusLabel({ workOrder: data.workOrder, shift })}
        onBack={onBack}
        onRefresh={onRefresh}
      />
    </AppContextOverride>
  );
}
