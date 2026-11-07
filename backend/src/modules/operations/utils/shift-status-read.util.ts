import { EntityManager } from 'typeorm';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';
import { WorkOrderShiftRole } from '../../../entities/work-order-shift-role.entity';
import { WorkOrderShiftRoleWorker } from '../../../entities/work-order-shift-role-worker.entity';
import { FormSubmission } from '../../../entities/form-submission.entity';
import {
  computeShiftStatus,
  aggregateShiftStatuses,
} from './shift-status.util';
interface IndexRow {
  id: string;
  workOrderId: string;
  date: string;
  status: string | null;
  cancelled: boolean;
  pmApprovedAt: Date | null;
  shiftName: string;
  startTime: string;
  projectId: string;
  projectNumber: string | null;
  projectName: string | null;
  clientName: string | null;
  title: string;
  orderNumber: string | null;
  assignmentStart: string | null;
  latestShift: string | null;
  creatorFirst: string | null;
  creatorLast: string | null;
}
interface RoleRow {
  id: string;
  shiftId: string;
  requiredCount: number;
}
interface WorkerRow {
  roleId: string;
  workerId: string;
  confirmationStatus: string;
  requestedAt: Date | null;
  notificationChannel: string | null;
}
export interface IndexedShift extends Omit<IndexRow, 'pmApprovedAt'> {
  [key: string]: unknown;
  pmApprovedAt: string | undefined;
  createdByName: string;
  roles: Array<{
    id: string;
    requiredCount: number;
    assignedWorkers: string[];
    workerConfirmations: Array<{
      workerId: string;
      status: string;
      requestedAt?: string;
      notificationChannel?: string;
    }>;
  }>;
  effectiveStatus: string | null;
  automatic: boolean;
}
export async function loadShiftStatusIndex(
  manager: EntityManager,
  range: { from?: string; to?: string } = {},
  withOrdering = false,
) {
  const scoped = <
    T extends { andWhere: (sql: string, params: Record<string, unknown>) => T },
  >(
    query: T,
  ) => {
    if (range.from) query.andWhere('s.date >= :from', { from: range.from });
    if (range.to) query.andWhere('s.date <= :to', { to: range.to });
    return query;
  };
  const shiftsQuery = manager
    .getRepository(WorkOrderShift)
    .createQueryBuilder('s')
    .innerJoin(
      'work_orders',
      'wo',
      'wo.id = s.work_order_id AND wo.deleted_at IS NULL',
    )
    .leftJoin('projects', 'p', 'p.id = wo.project_id')
    .leftJoin('clients', 'c', 'c.id = p.client_id')
    .leftJoin('users', 'creator', 'creator.id = s.created_by_user_id')
    .select('s.id', 'id')
    .addSelect('s.workOrderId', 'workOrderId')
    .addSelect('s.date::text', 'date')
    .addSelect('s.status', 'status')
    .addSelect('s.cancelled', 'cancelled')
    .addSelect('s.pmApprovedAt', 'pmApprovedAt')
    .addSelect('s.shiftName', 'shiftName')
    .addSelect('s.startTime', 'startTime')
    .addSelect('wo.project_id', 'projectId')
    .addSelect('p.number', 'projectNumber')
    .addSelect('p.name', 'projectName')
    .addSelect('c.name', 'clientName')
    .addSelect('wo.title', 'title')
    .addSelect('wo.order_number', 'orderNumber')
    .addSelect('wo.start_date::text', 'assignmentStart')
    .addSelect('NULL', 'latestShift')
    .addSelect('creator.first_name', 'creatorFirst')
    .addSelect('creator.last_name', 'creatorLast');
  const roleQuery = manager
    .getRepository(WorkOrderShiftRole)
    .createQueryBuilder('r')
    .innerJoin('work_order_shifts', 's', 's.id = r.shift_id')
    .innerJoin(
      'work_orders',
      'wo',
      'wo.id = s.work_order_id AND wo.deleted_at IS NULL',
    )
    .select('r.id', 'id')
    .addSelect('r.shiftId', 'shiftId')
    .addSelect('r.requiredCount', 'requiredCount')
    .orderBy('r.id', 'ASC');
  const workerQuery = manager
    .getRepository(WorkOrderShiftRoleWorker)
    .createQueryBuilder('rw')
    .innerJoin('work_order_shift_roles', 'r', 'r.id = rw.role_id')
    .innerJoin('work_order_shifts', 's', 's.id = r.shift_id')
    .innerJoin(
      'work_orders',
      'wo',
      'wo.id = s.work_order_id AND wo.deleted_at IS NULL',
    )
    .select('rw.roleId', 'roleId')
    .addSelect('rw.workerId', 'workerId')
    .addSelect('rw.confirmationStatus', 'confirmationStatus')
    .addSelect('rw.requestedAt', 'requestedAt')
    .addSelect('rw.notificationChannel', 'notificationChannel');
  const submittedQuery = manager
    .getRepository(FormSubmission)
    .createQueryBuilder('submission')
    .innerJoin(
      'work_order_shifts',
      's',
      's.id = submission.shift_id AND s.work_order_id = submission.work_order_id',
    )
    .innerJoin(
      'work_orders',
      'wo',
      'wo.id = s.work_order_id AND wo.deleted_at IS NULL',
    )
    .select('submission.workOrderId', 'workOrderId')
    .addSelect('submission.shiftId', 'shiftId')
    .distinct(true)
    .where('submission.status = :submitted', { submitted: 'submitted' });
  const latestQuery = withOrdering
    ? manager
        .getRepository(WorkOrderShift)
        .createQueryBuilder('all_shift')
        .select('all_shift.workOrderId', 'workOrderId')
        .addSelect(
          "MAX(all_shift.date::text || 'T' || COALESCE(all_shift.start_time, '00:00'))",
          'latestShift',
        )
        .where(
          'EXISTS (SELECT 1 FROM work_orders scope_wo JOIN work_order_shifts s ON s.work_order_id = scope_wo.id WHERE scope_wo.id = all_shift.work_order_id AND scope_wo.deleted_at IS NULL' +
            (range.from ? ' AND s.date >= :from' : '') +
            (range.to ? ' AND s.date <= :to' : '') +
            ')',
          range,
        )
        .groupBy('all_shift.workOrderId')
    : undefined;
  const [rows, roles, workers, submitted, latest] = await Promise.all([
    scoped(shiftsQuery).getRawMany<IndexRow>(),
    scoped(roleQuery).getRawMany<RoleRow>(),
    scoped(workerQuery).getRawMany<WorkerRow>(),
    scoped(submittedQuery).getRawMany<{
      workOrderId: string;
      shiftId: string;
    }>(),
    latestQuery
      ? latestQuery.getRawMany<{ workOrderId: string; latestShift: string }>()
      : Promise.resolve([]),
  ]);
  const latestByOrder = new Map(
    latest.map((row) => [row.workOrderId, row.latestShift]),
  );
  rows.forEach((row) => {
    row.latestShift = latestByOrder.get(row.workOrderId) || null;
  });
  const completed = new Set(
    submitted.map((row) => row.workOrderId + ':' + row.shiftId),
  );
  const completion = {
    isShiftCompleted: (workOrderId: string, shiftId: string) =>
      completed.has(workOrderId + ':' + shiftId),
  };
  const workersByRole = new Map<string, WorkerRow[]>();
  for (const worker of workers) {
    if (!workersByRole.has(worker.roleId)) workersByRole.set(worker.roleId, []);
    workersByRole.get(worker.roleId)!.push(worker);
  }
  const rolesByShift = new Map<string, IndexedShift['roles']>();
  for (const role of roles) {
    const assigned = workersByRole.get(role.id) || [];
    if (!rolesByShift.has(role.shiftId)) rolesByShift.set(role.shiftId, []);
    rolesByShift.get(role.shiftId)!.push({
      id: role.id,
      requiredCount: role.requiredCount,
      assignedWorkers: assigned.map((worker) => worker.workerId),
      workerConfirmations: assigned.map((worker) => ({
        workerId: worker.workerId,
        status: worker.confirmationStatus,
        requestedAt: worker.requestedAt?.toISOString(),
        notificationChannel: worker.notificationChannel || undefined,
      })),
    });
  }
  const shifts: IndexedShift[] = rows.map((row) => {
    const shift = {
      ...row,
      pmApprovedAt: row.pmApprovedAt?.toISOString(),
      createdByName:
        row.creatorFirst === null
          ? ''
          : `${row.creatorFirst || ''} ${row.creatorLast || ''}`.trim(),
      roles: rolesByShift.get(row.id) || [],
    };
    const computed = computeShiftStatus({
      workOrderId: row.workOrderId,
      shift: shift,
      completion,
    });
    return {
      ...shift,
      effectiveStatus: computed.status,
      automatic: computed.automatic,
    };
  });
  const counters = aggregateShiftStatuses({
    workOrderId: '',
    shifts: [],
    completion,
  });
  for (const shift of shifts) {
    const partial = aggregateShiftStatuses({
      workOrderId: shift.workOrderId,
      shifts: [shift],
      completion,
    });
    for (const key of Object.keys(counters) as Array<keyof typeof counters>)
      counters[key] += partial[key];
  }
  return { shifts, counters };
}
