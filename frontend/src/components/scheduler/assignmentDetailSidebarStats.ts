import type { Equipment, WorkOrder } from '@/lib/types';
import {
  getShiftConfirmationSummary,
  isWorkerAwaitingResponse,
} from './shiftConfirmation';

export interface AssignmentDetailStats {
  totalShifts: number;

  shiftsFullyConfirmed: number;

  shiftsPendingConfirmations: number;

  workerRepliesPending: number;

  missingWorkerSlots: number;
  equipmentIssueSlots: number;
  totalAssigned: number;
  totalRequired: number;
}

export function computeAssignmentDetailStats(
  wo: WorkOrder,
  equipmentCatalog: Equipment[],
): AssignmentDetailStats {
  void equipmentCatalog;
  let shiftsFullyConfirmed = 0;
  let shiftsPendingConfirmations = 0;
  let workerRepliesPending = 0;
  let missingWorkerSlots = 0;
  let equipmentIssueSlots = 0;
  let totalAssigned = 0;
  let totalRequired = 0;

  wo.shifts.forEach((s) => {
    const reply = getShiftConfirmationSummary(s);
    if (reply.assigned > 0) {
      s.roles.forEach((role) => {
        role.assignedWorkers.forEach((workerId) => {
          if (isWorkerAwaitingResponse(role, workerId))
            workerRepliesPending += 1;
        });
      });
      if (reply.status === 'confirmed') shiftsFullyConfirmed += 1;
      else shiftsPendingConfirmations += 1;
    }
    s.roles.forEach((r) => {
      totalRequired += r.requiredCount;
      totalAssigned += r.assignedWorkers.length;
      missingWorkerSlots += Math.max(
        0,
        r.requiredCount - r.assignedWorkers.length,
      );
    });
  });

  return {
    totalShifts: wo.shifts.length,
    shiftsFullyConfirmed,
    shiftsPendingConfirmations,
    workerRepliesPending,
    missingWorkerSlots,
    equipmentIssueSlots,
    totalAssigned,
    totalRequired,
  };
}
