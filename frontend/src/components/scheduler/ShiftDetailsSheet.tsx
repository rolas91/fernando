import { WorkerConfirmationIcons } from './WorkerConfirmationIcons';
import React, { useMemo } from 'react';
import { MapPin, Truck, Users } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useAppContext } from '@/contexts/AppContext';
import type { Shift, ShiftWorkerConfirmation } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getRoleRequiredCertificationIds } from '@/lib/workerCertificationMatch';
import { getWorkerConfirmationStatus } from './shiftConfirmation';

const formatTimeAmPm = (time: string) => {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  if (Number.isNaN(h)) return time;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export interface ShiftDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: Shift | null;
  woId: string | null;

  onEditShift: () => void;

  onSendReminders: () => void;
  isLocked?: boolean;
}

export const ShiftDetailsSheet: React.FC<ShiftDetailsSheetProps> = ({
  open,
  onOpenChange,
  shift: selectedShift,
  woId,
  onEditShift,
  onSendReminders,
  isLocked = false,
}) => {
  const { workOrders, getProjectById, getWorkerById, certifications } =
    useAppContext();

  const wo = useMemo(
    () => workOrders.find((w) => w.id === woId),
    [workOrders, woId],
  );
  const shift =
    wo?.shifts.find((item) => item.id === selectedShift?.id) ?? selectedShift;
  const cancelled = Boolean(
    shift?.cancelled || shift?.status === 'shift_cancelled',
  );
  const project = wo ? getProjectById(wo.projectId) : undefined;
  const isCompleted = isLocked || Boolean(shift?.pmApprovedAt);

  const certificationNameById = useMemo(
    () =>
      new Map(
        certifications.map((certification) => [
          certification.id,
          certification.name,
        ]),
      ),
    [certifications],
  );

  if (!shift || !wo) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className={cn(
            'flex w-full max-w-[min(100vw,480px)] flex-col gap-0 p-6 sm:max-w-[min(100vw,480px)]',
            'data-[state=open]:duration-500 data-[state=closed]:duration-300',
          )}
          aria-describedby={undefined}
        >
          <SheetTitle className="text-left text-xl font-bold text-gray-900">
            Shift Details
          </SheetTitle>
          <p className="mt-4 text-sm text-muted-foreground">
            This shift cannot be displayed.
          </p>
        </SheetContent>
      </Sheet>
    );
  }

  const dateLabel = new Date(`${shift.date}T12:00:00`).toLocaleDateString(
    'en-US',
    {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    },
  );

  const startTimeLabel = formatTimeAmPm(shift.startTime);
  const closeAndSendReminders = () => {
    onOpenChange(false);
    onSendReminders();
  };

  type Row = {
    roleName: string;
    required: number;
    assigned: number;
    confirmed: number;
    missing: number;
  };

  const tableRows: Row[] = shift.roles.map((role) => {
    let confirmed = 0;
    role.assignedWorkers.forEach((wid) => {
      if (getWorkerConfirmationStatus(role, wid) === 'confirmed')
        confirmed += 1;
    });
    const assigned = role.assignedWorkers.length;
    const pendingOrDeclined = assigned - confirmed;
    const openSlots = Math.max(0, role.requiredCount - assigned);
    return {
      roleName: role.roleName,
      required: role.requiredCount,
      assigned,
      confirmed,
      missing: openSlots + pendingOrDeclined,
    };
  });

  const confirmedWorkers: {
    worker: NonNullable<ReturnType<typeof getWorkerById>>;
    roleName: string;
    confirmation?: ShiftWorkerConfirmation;
  }[] = [];
  const pendingWorkers: {
    worker: NonNullable<ReturnType<typeof getWorkerById>>;
    roleName: string;
    confirmation?: ShiftWorkerConfirmation;
  }[] = [];

  shift.roles.forEach((role) => {
    role.assignedWorkers.forEach((wid) => {
      const worker = getWorkerById(wid);
      if (!worker) return;
      const st = getWorkerConfirmationStatus(role, wid);
      const confirmation = role.workerConfirmations?.find(
        (entry) => entry.workerId === wid,
      );
      const row = { worker, roleName: role.roleName, confirmation };
      if (
        cancelled
          ? Boolean(confirmation?.cancellationAcknowledgedAt)
          : st === 'confirmed'
      )
        confirmedWorkers.push(row);
      else pendingWorkers.push(row);
    });
  });

  const plannedEquipment = shift.plannedEquipment || [];
  const plannedMaterials = shift.plannedMaterials || [];
  const equipSlots = plannedEquipment.reduce(
    (total, item) => total + Math.max(0, Number(item.estimatedQuantity) || 0),
    0,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          'flex w-full max-w-[min(100vw,480px)] flex-col gap-0 overflow-y-auto p-0 sm:max-w-[min(100vw,480px)]',
          'data-[state=open]:duration-500 data-[state=closed]:duration-300',
        )}
        aria-describedby={undefined}
      >
        <div className="flex flex-shrink-0 items-start justify-between border-b border-gray-100 px-6 py-5 flex-wrap gap-3">
          <SheetTitle className="text-left text-xl font-bold tracking-tight text-gray-900">
            Shift Details
          </SheetTitle>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="space-y-1 text-sm text-gray-800">
            <p>
              <span className="font-semibold text-gray-500">Shift Name</span>{' '}
              <span className="font-medium">{shift.shiftName}</span>
            </p>
            <p>
              <span className="font-semibold text-gray-500">Project</span>{' '}
              <span className="font-medium">{project?.name ?? wo.title}</span>
            </p>
            <p>
              <span className="font-semibold text-gray-500">Date</span>{' '}
              <span className="font-medium">{dateLabel}</span>
            </p>
            <p>
              <span className="font-semibold text-gray-500">Start Time</span>{' '}
              <span className="font-medium">{startTimeLabel}</span>
            </p>
          </div>

          {shift.address || shift.crossStreetLocationDetail ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3">
              <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-900">
                <MapPin size={16} className="text-gray-500" />
                Location
              </h4>
              {shift.address ? (
                <p className="text-sm text-gray-800">
                  <span className="font-semibold text-gray-500">
                    Shift Address
                  </span>{' '}
                  <span className="font-medium">{shift.address}</span>
                </p>
              ) : null}
              {shift.crossStreetLocationDetail ? (
                <p className="mt-1 text-sm text-gray-800">
                  <span className="font-semibold text-gray-500">
                    Cross Street / Location Details
                  </span>{' '}
                  <span className="font-medium">
                    {shift.crossStreetLocationDetail}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-900">
              <Users size={16} className="text-gray-500" />
              Staffing
            </h4>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <div
                className="responsive-table"
                role="region"
                aria-label="Table data"
                tabIndex={0}
              >
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2 text-center">Required</th>
                      <th className="px-3 py-2 text-center">Assigned</th>
                      <th className="px-3 py-2 text-center">Confirmed</th>
                      <th className="px-3 py-2 text-center">Missing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {tableRows.map((row, i) => (
                      <tr key={`${row.roleName}-${i}`}>
                        <td className="px-3 py-2.5 font-semibold text-gray-800">
                          {row.roleName}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-gray-700">
                          {row.required}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-gray-700">
                          {row.assigned}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-emerald-700">
                          {row.confirmed}
                        </td>
                        <td className="px-3 py-2.5 text-center tabular-nums text-gray-900">
                          {row.missing}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {shift.roles.some(
            (r) => getRoleRequiredCertificationIds(r).length,
          ) ? (
            <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-3">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-violet-900">
                Required certifications by role
              </h4>
              <ul className="space-y-1.5 text-xs text-gray-800">
                {shift.roles.map((role) => {
                  const requiredCertificationIds =
                    getRoleRequiredCertificationIds(role);
                  return requiredCertificationIds.length ? (
                    <li key={role.id} className="leading-snug">
                      <span className="font-semibold text-violet-900">
                        {role.roleName}:
                      </span>{' '}
                      {requiredCertificationIds
                        .map((id) => certificationNameById.get(id) ?? id)
                        .join(', ')}
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          ) : null}

          <div className="space-y-4">
            {confirmedWorkers.length > 0 ? (
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-800">
                  {cancelled ? 'Cancellation confirmed' : 'Confirmed'} (
                  {confirmedWorkers.length})
                </h4>
                <div className="space-y-2">
                  {confirmedWorkers.map(
                    ({ worker, roleName, confirmation }) => (
                      <div
                        key={`c-${worker.id}-${roleName}`}
                        className="flex items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2"
                      >
                        {worker.avatar?.trim() ? (
                          <img
                            src={worker.avatar}
                            alt=""
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-700 text-[11px] font-bold uppercase text-white">
                            {worker.firstName?.[0] ?? '?'}
                            {worker.lastName?.[0] ?? ''}
                          </div>
                        )}
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {worker.firstName} {worker.lastName}
                          </p>
                          <p className="truncate text-[11px] text-gray-500">
                            {roleName}
                          </p>
                        </div>
                        <WorkerConfirmationIcons
                          confirmation={confirmation}
                          cancelled={cancelled}
                          detail
                          showPending
                        />
                      </div>
                    ),
                  )}
                </div>
              </div>
            ) : null}

            {pendingWorkers.length > 0 ? (
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-800">
                  {cancelled ? 'Awaiting cancellation confirmation' : 'Pending'}{' '}
                  ({pendingWorkers.length})
                </h4>
                <div className="space-y-2">
                  {pendingWorkers.map(({ worker, roleName, confirmation }) => (
                    <div
                      key={`p-${worker.id}-${roleName}`}
                      className="flex items-center gap-3 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2"
                    >
                      {worker.avatar?.trim() ? (
                        <img
                          src={worker.avatar}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-700 text-[11px] font-bold uppercase text-white">
                          {worker.firstName?.[0] ?? '?'}
                          {worker.lastName?.[0] ?? ''}
                        </div>
                      )}
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {worker.firstName} {worker.lastName}
                        </p>
                        <p className="truncate text-[11px] text-gray-500">
                          {roleName}
                        </p>
                      </div>
                      <WorkerConfirmationIcons
                        confirmation={confirmation}
                        cancelled={cancelled}
                        detail
                        showPending
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="w-full rounded-lg border border-primary/30 bg-white py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
                    onClick={closeAndSendReminders}
                  >
                    Send reminders
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-900">
              <Truck size={16} className="text-gray-500" />
              Equipment
              <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gray-600">
                {equipSlots > 0 ? `${equipSlots} planned` : 'Nothing planned'}
              </span>
            </div>
            {plannedEquipment.length === 0 && plannedMaterials.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-500">
                Nothing planned.
              </p>
            ) : (
              <div className="space-y-2">
                {plannedEquipment.map((resource, index) => {
                  const eid = `${resource.type}-${index}`;
                  const eq = {
                    name: resource.type,
                    identifier: `${resource.estimatedQuantity} planned`,
                  };
                  const label = eq
                    ? `${eq.name}${eq.identifier ? ` · ${eq.identifier}` : ''}`
                    : eid;
                  return (
                    <div
                      key={eid}
                      className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2 text-sm"
                    >
                      <span className="truncate font-medium text-gray-800">
                        {label}
                      </span>
                      <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        Assigned
                      </span>
                    </div>
                  );
                })}
                {plannedMaterials.map((resource, index) => {
                  const mid = `${resource.type}-${index}`;
                  const mat = {
                    name: `${resource.type} (${resource.estimatedQuantity} planned)`,
                  };
                  const label = mat?.name ?? mid;
                  return (
                    <div
                      key={mid}
                      className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2 text-sm"
                    >
                      <span className="truncate font-medium text-gray-800">
                        {label}
                      </span>
                      <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        Assigned
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-gray-100 pt-5">
            {isCompleted && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-xs font-medium text-gray-600">
                Completed shifts are read-only. Use the shift chat for
                conversation history.
              </div>
            )}
            <button
              type="button"
              disabled={isCompleted}
              className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-primary"
              onClick={() => {
                if (isCompleted) return;
                onOpenChange(false);
                onEditShift();
              }}
            >
              + Add Worker
            </button>
            <div className="responsive-grid grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isCompleted}
                className="rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white"
                onClick={() => {
                  if (isCompleted) return;
                  onOpenChange(false);
                  onEditShift();
                }}
              >
                Replace Worker
              </button>
              <button
                type="button"
                disabled={isCompleted}
                className="rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-white"
                onClick={closeAndSendReminders}
              >
                Send Reminders
              </button>
            </div>
            <button
              type="button"
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
              onClick={() => {
                onOpenChange(false);
                onEditShift();
              }}
            >
              {isCompleted ? 'View Shift' : 'Edit Shift'}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
