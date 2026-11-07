import { Shift, ShiftRole, ShiftWorkerConfirmationStatus } from '@/lib/types';
import { isFutureShiftDate } from '@/lib/shiftDate';

export function getShiftRoleStartTime(shift: Shift): string {
  const roleStartTimes = (shift.roles || [])
    .map((role) => role.startTime?.trim())
    .filter((time): time is string => Boolean(time))
    .sort();
  return roleStartTimes[0] || shift.defaultRoleStartTime || shift.startTime;
}

export function getWorkerConfirmationEntry(role: ShiftRole, workerId: string) {
  return role.workerConfirmations?.find((entry) => entry.workerId === workerId);
}

export function getWorkerConfirmationStatus(
  role: ShiftRole,
  workerId: string,
): ShiftWorkerConfirmationStatus {
  const existing = getWorkerConfirmationEntry(role, workerId);
  return existing?.status || 'pending';
}

export function hasWorkerConfirmationRequest(
  role: ShiftRole,
  workerId: string,
): boolean {
  const existing = getWorkerConfirmationEntry(role, workerId);
  return Boolean(existing?.requestedAt || existing?.notificationChannel);
}

export function isWorkerPendingInitialNotification(
  role: ShiftRole,
  workerId: string,
): boolean {
  return (
    getWorkerConfirmationStatus(role, workerId) === 'pending' &&
    !hasWorkerConfirmationRequest(role, workerId)
  );
}

export function hasWorkersPendingInitialNotification(shift: Shift): boolean {
  return shift.roles.some((role) =>
    role.assignedWorkers.some((workerId) =>
      isWorkerPendingInitialNotification(role, workerId),
    ),
  );
}

export function isWorkerAwaitingResponse(
  role: ShiftRole,
  workerId: string,
): boolean {
  return (
    getWorkerConfirmationStatus(role, workerId) === 'pending' &&
    hasWorkerConfirmationRequest(role, workerId)
  );
}

export function getRoleConfirmationCounts(role: ShiftRole) {
  let confirmed = 0;
  let pending = 0;
  let declined = 0;

  role.assignedWorkers.forEach((workerId) => {
    const status = getWorkerConfirmationStatus(role, workerId);
    if (status === 'confirmed') confirmed += 1;
    else if (status === 'declined') declined += 1;
    else pending += 1;
  });

  return {
    confirmed,
    pending,
    declined,
    assigned: role.assignedWorkers.length,
  };
}

export function getShiftConfirmationSummary(shift: Shift) {
  let confirmed = 0;
  let pending = 0;
  let declined = 0;
  let assigned = 0;

  shift.roles.forEach((role) => {
    const counts = getRoleConfirmationCounts(role);
    confirmed += counts.confirmed;
    pending += counts.pending;
    declined += counts.declined;
    assigned += counts.assigned;
  });

  const status =
    assigned > 0 && confirmed === assigned
      ? 'confirmed'
      : declined > 0
        ? 'declined'
        : 'pending';

  return {
    status,
    confirmed,
    pending,
    declined,
    assigned,
  };
}

export function getShiftMissingWorkerSlots(shift: Shift): number {
  let missing = 0;
  shift.roles.forEach((r) => {
    missing += Math.max(0, r.requiredCount - r.assignedWorkers.length);
  });
  return missing;
}

export function getShiftHoverStatus(shift: Shift) {
  const cs = getShiftConfirmationSummary(shift);
  const missingWorkerSlots = getShiftMissingWorkerSlots(shift);
  const totalRequired = shift.roles.reduce((a, r) => a + r.requiredCount, 0);

  let overallStatus: string;
  if (missingWorkerSlots > 0) {
    overallStatus =
      missingWorkerSlots === 1
        ? 'Understaffed — 1 open slot'
        : `Understaffed — ${missingWorkerSlots} open slots`;
  } else if (cs.assigned === 0) {
    overallStatus =
      totalRequired === 0
        ? 'No worker roles required'
        : 'No workers assigned yet';
  } else if (cs.declined > 0) {
    overallStatus = 'Action needed — some workers declined';
  } else if (cs.status === 'confirmed') {
    overallStatus = 'Complete — staffed and all confirmations in';
  } else {
    overallStatus = 'In progress — awaiting confirmations';
  }

  return {
    confirmedReplies: cs.confirmed,
    pendingReplies: cs.pending,
    declinedReplies: cs.declined,
    assignedSlots: cs.assigned,
    missingWorkerSlots,
    overallStatus,
  };
}

export type ShiftCardAccent =
  | 'completed'
  | 'understaffed'
  | 'declined'
  | 'confirmed'
  | 'pending_confirmation';

export type EffectiveShiftStatus =
  | 'customer_pending'
  | 'dispatch_pending'
  | 'ready_to_notify'
  | 'awaiting_response'
  | 'workers_confirmed'
  | 'shift_cancelled'
  | 'shift_completed'
  | 'pm_approved'
  | null;

export function canCancelShiftStatus(status: EffectiveShiftStatus): boolean {
  return status === 'awaiting_response' || status === 'workers_confirmed';
}

export function getEffectiveShiftStatus(
  shift: Shift,
  completed = false,
): EffectiveShiftStatus {
  if (shift.cancelled) return 'shift_cancelled';
  if (!isFutureShiftDate(shift.date) && shift.pmApprovedAt)
    return 'pm_approved';
  if (!isFutureShiftDate(shift.date) && completed) return 'shift_completed';
  const manual = shift.status || null;
  if (manual !== 'ready_to_notify') {
    return manual === 'customer_pending' || manual === 'dispatch_pending'
      ? manual
      : null;
  }
  const summary = getShiftConfirmationSummary(shift);
  if (summary.assigned > 0 && summary.confirmed === summary.assigned) {
    return 'workers_confirmed';
  }
  const awaiting = shift.roles.some((role) =>
    (role.workerConfirmations || []).some(
      (item) =>
        item.status === 'pending' &&
        Boolean(item.requestedAt || item.notificationChannel),
    ),
  );
  return awaiting ? 'awaiting_response' : 'ready_to_notify';
}

function shiftCopyBaseName(name: string): string {
  let base = name.trim();
  let previous = '';
  while (base !== previous) {
    previous = base;
    base = base
      .replace(/\s*-\s*\(copy\s+\d+\)\s*$/i, '')
      .replace(/\s*-\s*copied\s*$/i, '')
      .trim();
  }
  return base;
}

export function getNextShiftCopyName(
  sourceName: string,
  existingNames: readonly string[],
): string {
  const baseName = shiftCopyBaseName(sourceName);
  const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const numberedCopyPattern = new RegExp(
    `^${escapedBase}\\s*-\\s*\\(copy\\s+(\\d+)\\)$`,
    'i',
  );
  const legacyCopyPattern = new RegExp(`^${escapedBase}\\s*-\\s*copied$`, 'i');
  let highestCopyNumber = 0;

  existingNames.forEach((name) => {
    const normalizedName = name.trim();
    const numberedMatch = normalizedName.match(numberedCopyPattern);
    if (numberedMatch) {
      highestCopyNumber = Math.max(highestCopyNumber, Number(numberedMatch[1]));
    } else if (legacyCopyPattern.test(normalizedName)) {
      highestCopyNumber = Math.max(highestCopyNumber, 1);
    }
  });

  return `${baseName} - (Copy ${highestCopyNumber + 1})`;
}

export function prepareShiftDuplicate(
  source: Shift,
  duplicate: Shift,
  existingNames: readonly string[] = [],
): Shift {
  const namedDuplicate: Shift = {
    ...duplicate,
    shiftName: getNextShiftCopyName(source.shiftName, existingNames),
  };
  const sourceStatus = String(source.status ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const wasCancelled =
    Boolean(source.cancelled) ||
    sourceStatus === 'shift_cancelled' ||
    sourceStatus === 'cancelled' ||
    sourceStatus === 'canceled';
  if (!wasCancelled) return namedDuplicate;

  const hasRoles = namedDuplicate.roles.length > 0;
  const fullyStaffed =
    hasRoles &&
    namedDuplicate.roles.every(
      (role) => role.assignedWorkers.length >= Math.max(1, role.requiredCount),
    );

  return {
    ...namedDuplicate,
    cancelled: false,
    status: fullyStaffed ? 'ready_to_notify' : 'dispatch_pending',
    pmApprovedAt: undefined,
    pmApprovedByUserId: undefined,
    pmApprovedByName: undefined,
    roles: namedDuplicate.roles.map((role) => ({
      ...role,
      workerConfirmations: role.assignedWorkers.map((workerId) => ({
        workerId,
        status: 'pending' as const,
      })),
    })),
  };
}

export function reactivateCancelledShiftWithManualStatus(
  source: Shift,
  updated: Shift,
  selectedStatus: string,
): Shift {
  const sourceStatus = String(source.status ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const wasCancelled =
    Boolean(source.cancelled) ||
    sourceStatus === 'shift_cancelled' ||
    sourceStatus === 'cancelled' ||
    sourceStatus === 'canceled';
  const normalizedStatus = selectedStatus
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const isManualStatus =
    normalizedStatus === 'customer_pending' ||
    normalizedStatus === 'dispatch_pending' ||
    normalizedStatus === 'ready_to_notify';

  if (!wasCancelled || !isManualStatus) return updated;

  return {
    ...updated,
    cancelled: false,
    status: normalizedStatus,
    pmApprovedAt: undefined,
    pmApprovedByUserId: undefined,
    pmApprovedByName: undefined,
    roles: updated.roles.map((role) => ({
      ...role,
      workerConfirmations: role.assignedWorkers.map((workerId) => ({
        workerId,
        status: 'pending' as const,
      })),
    })),
  };
}

export function getShiftStatusPresentation(status: EffectiveShiftStatus) {
  const values = {
    customer_pending: {
      label: 'Customer Pending',
      badge: 'bg-orange-600 text-white',
      shell: 'border-orange-400 bg-orange-100',
    },
    dispatch_pending: {
      label: 'Dispatch Pending',
      badge: 'bg-yellow-500 text-yellow-950',
      shell: 'border-yellow-400 bg-yellow-100',
    },
    ready_to_notify: {
      label: 'Ready to Notify',
      badge: 'bg-blue-600 text-white',
      shell: 'border-blue-400 bg-blue-100',
    },
    awaiting_response: {
      label: 'Awaiting Response',
      badge: 'bg-violet-600 text-white',
      shell: 'border-violet-400 bg-violet-100',
    },
    workers_confirmed: {
      label: 'Workers Confirmed',
      badge: 'bg-green-600 text-white',
      shell: 'border-green-400 bg-green-100',
    },
    shift_cancelled: {
      label: 'Shift Cancelled',
      badge: 'bg-red-600 text-white',
      shell: 'border-red-400 bg-red-100',
    },
    shift_completed: {
      label: 'Shift Completed',
      badge: 'bg-slate-600 text-white',
      shell: 'border-slate-400 bg-slate-200',
    },
    pm_approved: {
      label: 'PM Approved',
      badge: 'bg-teal-600 text-white',
      shell: 'border-teal-500 bg-teal-100',
    },
  } as const;
  return status
    ? values[status]
    : {
        label: 'No Status',
        badge: 'bg-slate-600 text-white',
        shell: 'border-slate-300 bg-slate-50/70',
      };
}

export function getShiftCardAccent(shift: Shift): ShiftCardAccent {
  if (getShiftMissingWorkerSlots(shift) > 0) return 'understaffed';
  const cs = getShiftConfirmationSummary(shift);
  if (cs.status === 'declined') return 'declined';
  if (cs.status === 'confirmed') return 'confirmed';
  return 'pending_confirmation';
}

export function getShiftHeadcountTextClass(shift: Shift): string {
  switch (getShiftCardAccent(shift)) {
    case 'completed':
      return 'text-gray-600';
    case 'understaffed':
      return 'text-orange-600';
    case 'declined':
      return 'text-red-600';
    case 'confirmed':
      return 'text-emerald-600';
    case 'pending_confirmation':
      return 'text-amber-600';
  }
}

export function getRoleHeadcountTextClass(role: ShiftRole): string {
  if (role.assignedWorkers.length < role.requiredCount)
    return 'text-orange-600';
  if (role.assignedWorkers.length === 0) return 'text-gray-500';
  let anyDeclined = false;
  let allConfirmed = true;
  for (const wid of role.assignedWorkers) {
    const st = getWorkerConfirmationStatus(role, wid);
    if (st === 'declined') anyDeclined = true;
    if (st !== 'confirmed') allConfirmed = false;
  }
  if (anyDeclined) return 'text-red-600';
  if (allConfirmed) return 'text-emerald-600';
  return 'text-amber-600';
}
