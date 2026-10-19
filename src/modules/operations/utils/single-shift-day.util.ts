import { EntityManager } from 'typeorm';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';

export async function isOnlyShiftForDay(
  manager: EntityManager,
  workerId: string,
  shiftId: string,
  date: string,
): Promise<boolean> {
  if (!workerId || !shiftId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const shifts = await manager
    .getRepository(WorkOrderShift)
    .createQueryBuilder('shift')
    .innerJoin('shift.roles', 'role')
    .innerJoin('role.workerAssignments', 'assignment')
    .innerJoin('shift.workOrder', 'workOrder')
    .where('assignment.workerId = :workerId', { workerId })
    .andWhere('shift.date = :date', { date })
    .andWhere('shift.cancelled = false')
    .andWhere(
      "COALESCE(LOWER(shift.status), '') NOT IN ('shift_cancelled', 'cancelled', 'canceled')",
    )
    .andWhere("LOWER(workOrder.status) NOT IN ('cancelled', 'canceled')")
    .select(['shift.id'])
    .getMany();
  const ids = new Set(shifts.map((shift) => shift.id));
  return ids.size === 1 && ids.has(shiftId);
}
