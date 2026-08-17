import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';
import { WorkOrderShiftRole } from '../../../entities/work-order-shift-role.entity';
import { WorkOrderShiftRoleWorker } from '../../../entities/work-order-shift-role-worker.entity';

/**
 * Read-only query service for the relational representation of work order shifts.
 * Returns the shifts/roles/assignments from the new tables. Returns null when
 * the work order has no rows in the tables, so callers can render an empty
 * shifts list.
 */
@Injectable()
export class ShiftsQueryService {
  private readonly logger = new Logger(ShiftsQueryService.name);

  constructor(
    @InjectRepository(WorkOrderShift)
    private readonly shiftsRepo: Repository<WorkOrderShift>,
    @InjectRepository(WorkOrderShiftRole)
    private readonly rolesRepo: Repository<WorkOrderShiftRole>,
    @InjectRepository(WorkOrderShiftRoleWorker)
    private readonly workerAssignmentsRepo: Repository<WorkOrderShiftRoleWorker>,
  ) {}

  /**
   * Returns the relational shifts for a work order, or null if no rows
   * exist in the new tables (caller should fall back to the legacy JSON).
   */
  async loadShiftsForWorkOrder(
    workOrderId: string,
  ): Promise<Record<string, unknown>[] | null> {
    const shiftRows = await this.shiftsRepo.find({
      where: { workOrderId },
      order: { date: 'ASC', displayOrder: 'ASC' },
      relations: { pmApprovedByUser: true, createdByUser: true },
    });
    if (shiftRows.length === 0) return null;

    const roleRows = await this.rolesRepo
      .createQueryBuilder('role')
      .innerJoin('work_order_shifts', 'shift', 'shift.id = role.shift_id')
      .where('shift.work_order_id = :workOrderId', { workOrderId })
      .orderBy('role.id', 'ASC')
      .getMany();

    const workerRows = await this.workerAssignmentsRepo
        .createQueryBuilder('w')
        .innerJoin('work_order_shift_roles', 'role', 'role.id = w.role_id')
        .innerJoin('work_order_shifts', 'shift', 'shift.id = role.shift_id')
        .where('shift.work_order_id = :workOrderId', { workOrderId })
        .getMany();

    const workerByRole = new Map<string, WorkOrderShiftRoleWorker[]>();
    for (const w of workerRows) {
      const list = workerByRole.get(w.roleId) ?? [];
      list.push(w);
      workerByRole.set(w.roleId, list);
    }

    const rolesByShift = new Map<string, WorkOrderShiftRole[]>();
    for (const role of roleRows) {
      const list = rolesByShift.get(role.shiftId) ?? [];
      list.push(role);
      rolesByShift.set(role.shiftId, list);
    }

    return shiftRows.map((shift) => {
      const roleList = rolesByShift.get(shift.id) ?? [];
      return {
        id: shift.id,
        workOrderId: shift.workOrderId,
        shiftName: shift.shiftName,
        date: shift.date,
        displayOrder: shift.displayOrder,
        startTime: shift.startTime,
        endTime: shift.endTime,
        status: shift.status,
        confirmationResetReason: shift.confirmationResetReason ?? undefined,
        cancelled: shift.cancelled,
        pmApprovedAt: shift.pmApprovedAt?.toISOString(),
        pmApprovedByUserId: shift.pmApprovedByUserId ?? undefined,
        pmApprovedByName: shift.pmApprovedByUser
          ? `${shift.pmApprovedByUser.firstName} ${shift.pmApprovedByUser.lastName}`.trim()
          : undefined,
        createdByUserId: shift.createdByUserId ?? undefined,
        createdByName: shift.createdByUser
          ? `${shift.createdByUser.firstName} ${shift.createdByUser.lastName}`.trim()
          : undefined,
        requesterUserId: shift.requesterUserId ?? undefined,
        address: shift.address ?? undefined,
        crossStreetLocationDetail: shift.crossStreetLocationDetail ?? undefined,
        addressLatitude: shift.addressLatitude, addressLongitude: shift.addressLongitude,
        addressCity: shift.addressCity ?? undefined, addressState: shift.addressState ?? undefined,
        addressZipCode: shift.addressZipCode ?? undefined, addressCountry: shift.addressCountry ?? undefined,
        requesterName: shift.requesterName ?? undefined,
        requesterPhone: shift.requesterPhone ?? undefined,
        requesterEmail: shift.requesterEmail ?? undefined,
        visibleDocumentTypes: [...(shift.visibleDocumentTypes ?? [])],
        notes: shift.notes ?? undefined,
        clientTimesheetNotes: shift.clientTimesheetNotes ?? '',
        internalTimesheetNotes: shift.internalTimesheetNotes ?? '',
        plannedEquipment: [...(shift.plannedEquipment ?? [])],
        plannedMaterials: [...(shift.plannedMaterials ?? [])],
        workOrderTypes: [...(shift.workOrderTypes ?? [])],
        workOrderAuthorizedWorkerIds: [...(shift.workOrderAuthorizedWorkerIds ?? [])],
        defaultRoleStartTime: shift.defaultRoleStartTime ?? undefined,
        shiftTemplateId: shift.shiftTemplateId ?? undefined,
        roles: roleList.map((role) => {
          const workerList = workerByRole.get(role.id) ?? [];
          return {
            id: role.id,
            roleName: role.roleName,
            requiredCount: role.requiredCount,
            startTime: role.startTime ?? undefined,
            requiredCertificationIds: [...role.requiredCertificationIds],
            requiredSkillIds: [...role.requiredSkillIds],
            assignedWorkers: workerList.map((w) => w.workerId),
            workerConfirmations: workerList.map((w) => {
              const out: Record<string, unknown> = {
                workerId: w.workerId,
                status: w.confirmationStatus,
              };
              if (w.requestedAt) out.requestedAt = w.requestedAt.toISOString();
              if (w.respondedAt) out.respondedAt = w.respondedAt.toISOString();
              if (w.notificationChannel) out.notificationChannel = w.notificationChannel;
              return out;
            }),
          };
        }),
      };
    });
  }

  /** Returns true once the work order has any row in the new tables. */
  async hasRelationalData(workOrderId: string): Promise<boolean> {
    const count = await this.shiftsRepo.count({ where: { workOrderId } });
    return count > 0;
  }

  /**
   * Batch version: returns a map workOrderId -> shifts[]|null. Work orders
   * with no relational rows are omitted from the map so callers can fall
   * back to the legacy JSON for them.
   */
  async loadShiftsForWorkOrders(
    workOrderIds: string[],
  ): Promise<Map<string, Record<string, unknown>[]>> {
    const out = new Map<string, Record<string, unknown>[]>();
    if (workOrderIds.length === 0) return out;

    const shiftRows = await this.shiftsRepo.find({
      where: { workOrderId: In(workOrderIds) },
      order: { date: 'ASC', displayOrder: 'ASC' },
      relations: { pmApprovedByUser: true, createdByUser: true },
    });
    if (shiftRows.length === 0) return out;

    const [roleRows, workerRows] = await Promise.all([
      this.rolesRepo
        .createQueryBuilder('role')
        .innerJoin('work_order_shifts', 'shift', 'shift.id = role.shift_id')
        .where('shift.work_order_id IN (:...workOrderIds)', { workOrderIds })
        .orderBy('role.id', 'ASC')
        .getMany(),
      this.workerAssignmentsRepo
        .createQueryBuilder('w')
        .innerJoin('work_order_shift_roles', 'role', 'role.id = w.role_id')
        .innerJoin('work_order_shifts', 'shift', 'shift.id = role.shift_id')
        .where('shift.work_order_id IN (:...workOrderIds)', { workOrderIds })
        .getMany(),
    ]);

    const workerByRole = new Map<string, WorkOrderShiftRoleWorker[]>();
    for (const w of workerRows) {
      const list = workerByRole.get(w.roleId) ?? [];
      list.push(w);
      workerByRole.set(w.roleId, list);
    }
    const rolesByShift = new Map<string, WorkOrderShiftRole[]>();
    for (const role of roleRows) {
      const list = rolesByShift.get(role.shiftId) ?? [];
      list.push(role);
      rolesByShift.set(role.shiftId, list);
    }

    const grouped = new Map<string, typeof shiftRows>();
    for (const shift of shiftRows) {
      const list = grouped.get(shift.workOrderId) ?? [];
      list.push(shift);
      grouped.set(shift.workOrderId, list);
    }

    for (const [workOrderId, shifts] of grouped) {
      out.set(
        workOrderId,
        shifts.map((shift) => {
          const roleList = rolesByShift.get(shift.id) ?? [];
          return {
            id: shift.id,
            workOrderId: shift.workOrderId,
            shiftName: shift.shiftName,
            date: shift.date,
            displayOrder: shift.displayOrder,
            startTime: shift.startTime,
            endTime: shift.endTime,
            status: shift.status,
            confirmationResetReason: shift.confirmationResetReason ?? undefined,
            cancelled: shift.cancelled,
            pmApprovedAt: shift.pmApprovedAt?.toISOString(),
            pmApprovedByUserId: shift.pmApprovedByUserId ?? undefined,
            pmApprovedByName: shift.pmApprovedByUser
              ? `${shift.pmApprovedByUser.firstName} ${shift.pmApprovedByUser.lastName}`.trim()
              : undefined,
            createdByUserId: shift.createdByUserId ?? undefined,
            createdByName: shift.createdByUser
              ? `${shift.createdByUser.firstName} ${shift.createdByUser.lastName}`.trim()
              : undefined,
            requesterUserId: shift.requesterUserId ?? undefined,
            address: shift.address ?? undefined,
            crossStreetLocationDetail: shift.crossStreetLocationDetail ?? undefined,
            addressLatitude: shift.addressLatitude, addressLongitude: shift.addressLongitude,
            addressCity: shift.addressCity ?? undefined, addressState: shift.addressState ?? undefined,
            addressZipCode: shift.addressZipCode ?? undefined, addressCountry: shift.addressCountry ?? undefined,
            requesterName: shift.requesterName ?? undefined,
            requesterPhone: shift.requesterPhone ?? undefined,
            requesterEmail: shift.requesterEmail ?? undefined,
            visibleDocumentTypes: [...(shift.visibleDocumentTypes ?? [])],
            notes: shift.notes ?? undefined,
            clientTimesheetNotes: shift.clientTimesheetNotes ?? '',
            internalTimesheetNotes: shift.internalTimesheetNotes ?? '',
            plannedEquipment: [...(shift.plannedEquipment ?? [])],
            plannedMaterials: [...(shift.plannedMaterials ?? [])],
            workOrderTypes: [...(shift.workOrderTypes ?? [])],
            workOrderAuthorizedWorkerIds: [...(shift.workOrderAuthorizedWorkerIds ?? [])],
            defaultRoleStartTime: shift.defaultRoleStartTime ?? undefined,
            shiftTemplateId: shift.shiftTemplateId ?? undefined,
            roles: roleList.map((role) => {
              const workerList = workerByRole.get(role.id) ?? [];
              return {
                id: role.id,
                roleName: role.roleName,
                requiredCount: role.requiredCount,
                startTime: role.startTime ?? undefined,
                requiredCertificationIds: [...role.requiredCertificationIds],
                requiredSkillIds: [...role.requiredSkillIds],
                assignedWorkers: workerList.map((w) => w.workerId),
                workerConfirmations: workerList.map((w) => {
                  const conf: Record<string, unknown> = {
                    workerId: w.workerId,
                    status: w.confirmationStatus,
                  };
                  if (w.requestedAt) conf.requestedAt = w.requestedAt.toISOString();
                  if (w.respondedAt) conf.respondedAt = w.respondedAt.toISOString();
                  if (w.notificationChannel)
                    conf.notificationChannel = w.notificationChannel;
                  return conf;
                }),
              };
            }),
          };
        }),
      );
    }
    return out;
  }
}
