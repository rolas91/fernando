import type { Equipment, WorkOrder } from '@/lib/types';
import {
  getShiftConfirmationSummary,
  getWorkerConfirmationStatus,
  isWorkerAwaitingResponse,
} from './shiftConfirmation';

export interface ScheduleDashboardStats {
  totalShifts: number;

  completedShifts: number;

  shiftsAllWorkersConfirmed: number;

  shiftsWorkerConfirmationsOutstanding: number;

  missingWorkerSlots: number;

  awaitingWorkerResponses: number;

  equipmentIssueSlots: number;
  totalWorkers: number;
  totalRequired: number;
  confirmedWorkers: number;
  uniqueWorkers: number;
  totalEquipSlotCount: number;
}

export function computeScheduleDashboardStats(
  assignments: WorkOrder[],
  datesInScopeISO: readonly string[],
  equipmentCatalog: Equipment[],
  completedShiftKeys: ReadonlySet<string> = new Set(),
): ScheduleDashboardStats {
  const dateSet = new Set(datesInScopeISO);
  const equipMap = new Map(equipmentCatalog.map((e) => [e.id, e]));

  let totalShifts = 0;
  let completedShifts = 0;
  let shiftsAllWorkersConfirmed = 0;
  let shiftsWorkerConfirmationsOutstanding = 0;
  let missingWorkerSlots = 0;
  let awaitingWorkerResponses = 0;
  let equipmentIssueSlots = 0;
  let totalWorkers = 0;
  let totalRequired = 0;
  let confirmedWorkers = 0;
  let totalEquipSlotCount = 0;
  const uniqueWorkers = new Set<string>();

  assignments.forEach(({ id, shifts }) => {
    shifts.forEach((s) => {
      if (!dateSet.has(s.date)) return;
      totalShifts += 1;
      const shiftCompleted = completedShiftKeys.has(`${id}:${s.id}`);

      s.roles.forEach((r) => {
        totalRequired += r.requiredCount;
        totalWorkers += r.assignedWorkers.length;
        r.assignedWorkers.forEach((wid) => {
          uniqueWorkers.add(wid);
          if (getWorkerConfirmationStatus(r, wid) === 'confirmed')
            confirmedWorkers += 1;
        });
      });

      if (shiftCompleted) {
        completedShifts += 1;
        return;
      }

      const replySummary = getShiftConfirmationSummary(s);
      if (replySummary.assigned > 0) {
        if (replySummary.status === 'confirmed') shiftsAllWorkersConfirmed += 1;
        else shiftsWorkerConfirmationsOutstanding += 1;
      }

      s.roles.forEach((r) => {
        r.assignedWorkers.forEach((wid) => {
          if (isWorkerAwaitingResponse(r, wid)) awaitingWorkerResponses += 1;
        });
        missingWorkerSlots += Math.max(
          0,
          r.requiredCount - r.assignedWorkers.length,
        );
      });
      totalEquipSlotCount += (s.plannedEquipment || []).reduce(
        (total, item) =>
          total + Math.max(0, Number(item.estimatedQuantity) || 0),
        0,
      );
    });
  });

  return {
    totalShifts,
    completedShifts,
    shiftsAllWorkersConfirmed,
    shiftsWorkerConfirmationsOutstanding,
    missingWorkerSlots,
    awaitingWorkerResponses,
    equipmentIssueSlots,
    totalWorkers,
    totalRequired,
    confirmedWorkers,
    uniqueWorkers: uniqueWorkers.size,
    totalEquipSlotCount,
  };
}
