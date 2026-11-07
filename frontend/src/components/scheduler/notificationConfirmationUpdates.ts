import type { ShiftWorkerConfirmation, WorkOrder } from '@/lib/types';
import type { NotificationLogEntry } from './NotifyWorkerModal';

const SUCCESS_STATUSES = new Set<NotificationLogEntry['status']>([
  'sent',
  'delivered',
  'simulated',
]);

function notificationKey(
  entry: Pick<
    NotificationLogEntry,
    'workOrderId' | 'shiftId' | 'roleId' | 'workerId'
  >,
) {
  return `${entry.workOrderId}:${entry.shiftId}:${entry.roleId}:${entry.workerId}`;
}

export function applyNotificationRequestEntriesToWorkOrder(
  workOrder: WorkOrder,
  entries: NotificationLogEntry[],
): WorkOrder | null {
  const sentByKey = new Map<string, NotificationLogEntry>();

  entries.forEach((entry) => {
    if (entry.action !== 'assigned' || !SUCCESS_STATUSES.has(entry.status))
      return;
    if (
      !entry.workOrderId ||
      !entry.shiftId ||
      !entry.roleId ||
      !entry.workerId
    )
      return;
    sentByKey.set(notificationKey(entry), entry);
  });

  if (sentByKey.size === 0) return null;

  let changed = false;
  const shifts = workOrder.shifts.map((shift) => ({
    ...shift,
    roles: shift.roles.map((role) => {
      const nextConfirmations = [...(role.workerConfirmations ?? [])];
      let roleChanged = false;

      role.assignedWorkers.forEach((workerId) => {
        const entry = sentByKey.get(
          notificationKey({
            workOrderId: workOrder.id,
            shiftId: shift.id,
            roleId: role.id,
            workerId,
          }),
        );
        if (!entry) return;

        const existingIndex = nextConfirmations.findIndex(
          (item) => item.workerId === workerId,
        );
        const existing =
          existingIndex >= 0 ? nextConfirmations[existingIndex] : undefined;
        const status: ShiftWorkerConfirmation['status'] =
          existing?.status === 'confirmed' || existing?.status === 'declined'
            ? existing.status
            : 'pending';
        const next: ShiftWorkerConfirmation = {
          ...existing,
          workerId,
          status,
          requestedAt: entry.requestedAt || entry.timestamp,
          notificationChannel: entry.notificationChannel || entry.channel,
        };

        if (existingIndex >= 0) {
          nextConfirmations[existingIndex] = next;
        } else {
          nextConfirmations.push(next);
        }
        changed = true;
        roleChanged = true;
      });

      return roleChanged
        ? { ...role, workerConfirmations: nextConfirmations }
        : role;
    }),
  }));

  return changed ? { ...workOrder, shifts } : null;
}
