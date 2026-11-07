import type { ShiftRole, WorkOrder } from '@/lib/types';

function normalizeStatus(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function workerParticipatedInRole(role: ShiftRole, workerId: string): boolean {
  if (!role.assignedWorkers.includes(workerId)) return false;

  const confirmation = role.workerConfirmations?.find(
    (entry) => entry.workerId === workerId,
  );
  const confirmationStatus = normalizeStatus(confirmation?.status || 'pending');

  if (confirmationStatus === 'declined') return false;
  if (confirmationStatus === 'confirmed') return true;

  return false;
}

function workerAssignedToRole(role: ShiftRole, workerId: string): boolean {
  if (!role.assignedWorkers.includes(workerId)) return false;

  const confirmation = role.workerConfirmations?.find(
    (entry) => entry.workerId === workerId,
  );
  return normalizeStatus(confirmation?.status || 'pending') !== 'declined';
}

function weekBounds(dateStr: string): { start: Date; end: Date } | null {
  const value = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(value.getTime())) return null;

  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));

  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export function getWeeklyAssignedShiftCount(
  workerId: string,
  workOrders: WorkOrder[],
  refDate: string,
): number {
  const bounds = weekBounds(refDate);
  if (!bounds) return 0;

  const shiftKeys = new Set<string>();

  workOrders.forEach((workOrder) => {
    if (workOrder.deletedAt) {
      return;
    }

    workOrder.shifts.forEach((shift) => {
      const shiftDate = new Date(`${shift.date}T12:00:00`);
      if (
        Number.isNaN(shiftDate.getTime()) ||
        shiftDate < bounds.start ||
        shiftDate >= bounds.end
      ) {
        return;
      }

      const assigned = shift.roles.some((role) =>
        workerAssignedToRole(role, workerId),
      );
      if (assigned) shiftKeys.add(`${workOrder.id}:${shift.id}`);
    });
  });

  return shiftKeys.size;
}

export function getRestHoursSinceLastShift(
  workerId: string,
  workOrders: WorkOrder[],
  refDate: string,
  refStart: string,
): number | null {
  const ref = new Date(`${refDate}T${refStart}`);
  if (Number.isNaN(ref.getTime())) return null;

  let lastEnd: Date | null = null;

  workOrders.forEach((workOrder) => {
    if (workOrder.deletedAt) {
      return;
    }

    workOrder.shifts.forEach((shift) => {
      const participated = shift.roles.some((role) =>
        workerParticipatedInRole(role, workerId),
      );
      if (!participated) return;

      const shiftStart = new Date(`${shift.date}T${shift.startTime}`);
      const shiftEnd = new Date(`${shift.date}T${shift.endTime}`);
      if (
        Number.isNaN(shiftStart.getTime()) ||
        Number.isNaN(shiftEnd.getTime())
      ) {
        return;
      }

      if (shiftEnd <= shiftStart) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }
      if (shiftEnd >= ref) return;
      if (!lastEnd || shiftEnd > lastEnd) lastEnd = shiftEnd;
    });
  });

  if (!lastEnd) return null;
  return (ref.getTime() - lastEnd.getTime()) / (1000 * 60 * 60);
}

export function formatShiftEndedAgo(restHours: number): string {
  const totalMinutes = Math.max(0, Math.round(restHours * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `Shift ended ${minutes}m ago`;
  if (minutes === 0) return `Shift ended ${hours}h ago`;
  return `Shift ended ${hours}h ${minutes}m ago`;
}
