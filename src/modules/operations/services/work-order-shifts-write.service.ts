import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';
import { WorkOrderShiftRole } from '../../../entities/work-order-shift-role.entity';
import {
  WorkOrderShiftRoleWorker,
  type ShiftWorkerConfirmationStatus,
} from '../../../entities/work-order-shift-role-worker.entity';

export type ShiftWriteInput = {
  id: string;
  shiftName: string;
  date: string;
  startTime: string;
  endTime: string;
  status?: string;
  confirmationResetReason?: string | null;
  cancelled?: boolean;
  pmApprovedAt?: string | null;
  pmApprovedByUserId?: string | null;
  createdByUserId?: string | null;
  requesterUserId?: string | null;
  address?: string | null;
  crossStreetLocationDetail?: string | null;
  addressLatitude?: number | null; addressLongitude?: number | null;
  addressCity?: string | null; addressState?: string | null; addressZipCode?: string | null; addressCountry?: string | null;
  requesterName?: string | null;
  requesterPhone?: string | null;
  requesterEmail?: string | null;
  visibleDocumentTypes?: string[];
  notes?: string | null;
  clientTimesheetNotes?: string;
  internalTimesheetNotes?: string;
  plannedEquipment?: Array<{ type: string; estimatedQuantity: number }>;
  plannedMaterials?: Array<{ type: string; estimatedQuantity: number; materialIds?: string[] }>;
  workOrderTypes?: string[];
  workOrderAuthorizedWorkerIds?: string[];
  defaultRoleStartTime?: string | null;
  shiftTemplateId?: string | null;
  roles: Array<{
    id: string;
    roleName: string;
    requiredCount: number;
    startTime?: string | null;
    requiredCertificationIds?: string[];
    requiredSkillIds?: string[];
    assignedWorkers: Array<{ workerId: string; status?: ShiftWorkerConfirmationStatus; respondedAt?: string | null; requestedAt?: string | null; notificationChannel?: string | null }>;
  }>;
};

/**
 * Single source of truth for writes against the relational shift tables.
 * - Uses transactions so a partial write never leaks.
 * - Replaces all rows for a work order in one call (simpler than diffing).
 * - Idempotent: callers can re-invoke with the same payload safely.
 */
@Injectable()
export class WorkOrderShiftsWriteService {
  private readonly logger = new Logger(WorkOrderShiftsWriteService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(WorkOrderShift)
    private readonly shiftsRepo: Repository<WorkOrderShift>,
    @InjectRepository(WorkOrderShiftRole)
    private readonly rolesRepo: Repository<WorkOrderShiftRole>,
    @InjectRepository(WorkOrderShiftRoleWorker)
    private readonly workerAssignmentsRepo: Repository<WorkOrderShiftRoleWorker>,
  ) {}

  async assertShiftNotPmApproved(workOrderId?: string | null, shiftId?: string | null) {
    if (!workOrderId || !shiftId) return;
    const shift = await this.shiftsRepo.findOne({
      where: { id: shiftId, workOrderId },
      select: { id: true, pmApprovedAt: true },
    });
    if (shift?.pmApprovedAt) {
      throw new ForbiddenException(
        `PM Approved shift ${shiftId} is locked. An administrator must reopen it before making changes.`,
      );
    }
  }

  /** Replace all shifts/roles/assignments for a work order atomically. */
  async replaceShiftsForWorkOrder(
    workOrderId: string,
    shifts: ShiftWriteInput[],
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const shiftRepo = manager.getRepository(WorkOrderShift);
      const roleRepo = manager.getRepository(WorkOrderShiftRole);
      const workerRepo = manager.getRepository(WorkOrderShiftRoleWorker);

      const existingShifts = await shiftRepo.find({ where: { workOrderId } });
      const existingShiftIds = existingShifts.map((s) => s.id);

      if (existingShiftIds.length > 0) {
        const existingRoles = await roleRepo.find({ where: { shiftId: In(existingShiftIds) } });
        const existingRoleIds = existingRoles.map((r) => r.id);
        if (existingRoleIds.length > 0) {
          await workerRepo.delete({ roleId: In(existingRoleIds) });
          await roleRepo.delete({ id: In(existingRoleIds) });
        }
        await shiftRepo.delete({ id: In(existingShiftIds) });
      }
      if (shifts.length === 0) return;

      const shiftRows = shifts.map((s) => {
        const assignedWorkerIds = new Set(
          s.roles.flatMap((role) => role.assignedWorkers.map((worker) => worker.workerId)),
        );
        const workOrderAuthorizedWorkerIds = [
          ...new Set(
            (s.workOrderAuthorizedWorkerIds ?? [])
              .map((workerId) => workerId.trim())
              .filter((workerId) => workerId && assignedWorkerIds.has(workerId)),
          ),
        ];
        return {
          id: s.id,
          workOrderId,
          shiftName: s.shiftName?.trim() ?? '',
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          status: s.status?.trim() || null,
          confirmationResetReason: s.confirmationResetReason?.trim() || null,
          cancelled: s.cancelled ?? false,
          pmApprovedAt: s.pmApprovedAt ? new Date(s.pmApprovedAt) : null,
          pmApprovedByUserId: s.pmApprovedByUserId ?? null,
          createdByUserId: s.createdByUserId ?? null,
          requesterUserId: s.requesterUserId ?? null,
          address: s.address ?? null,
          crossStreetLocationDetail: s.crossStreetLocationDetail?.trim() || null,
          addressLatitude: s.addressLatitude ?? null, addressLongitude: s.addressLongitude ?? null,
          addressCity: s.addressCity ?? null, addressState: s.addressState ?? null, addressZipCode: s.addressZipCode ?? null, addressCountry: s.addressCountry ?? null,
          requesterName: s.requesterName ?? null,
          requesterPhone: s.requesterPhone?.trim() || null,
          requesterEmail: s.requesterEmail?.trim().toLowerCase() || null,
          visibleDocumentTypes: [...(s.visibleDocumentTypes ?? [])],
          notes: s.notes ?? null,
          clientTimesheetNotes: s.clientTimesheetNotes ?? '',
          internalTimesheetNotes: s.internalTimesheetNotes ?? '',
          plannedEquipment: [...(s.plannedEquipment ?? [])],
          plannedMaterials: [...(s.plannedMaterials ?? [])],
          workOrderTypes: [...(s.workOrderTypes ?? [])],
          workOrderAuthorizedWorkerIds,
          defaultRoleStartTime: s.defaultRoleStartTime ?? null,
          shiftTemplateId: s.shiftTemplateId ?? null,
        };
      });
      if (shiftRows.length > 0) await shiftRepo.insert(shiftRows as any);

      const roleRows: any[] = [];
      const workerRows: any[] = [];
      for (const s of shifts) {
        for (const r of s.roles) {
          roleRows.push({
            id: r.id,
            shiftId: s.id,
            roleName: r.roleName,
            requiredCount: r.requiredCount,
            startTime: r.startTime ?? null,
            requiredCertificationIds: [...(r.requiredCertificationIds ?? [])],
            requiredSkillIds: [...(r.requiredSkillIds ?? [])],
          });
          for (const w of r.assignedWorkers) {
            workerRows.push({
              roleId: r.id,
              workerId: w.workerId,
              confirmationStatus: w.status ?? 'pending',
              respondedAt: w.respondedAt ? new Date(w.respondedAt) : null,
              requestedAt: w.requestedAt ? new Date(w.requestedAt) : null,
              notificationChannel: w.notificationChannel ?? null,
            });
          }
        }
      }

      if (roleRows.length > 0) await roleRepo.insert(roleRows as any);
      if (workerRows.length > 0) await workerRepo.insert(workerRows as any);
    });
  }

  /** Update a single worker's confirmation for a given (shift, role) tuple. */
  async updateWorkerConfirmation(input: {
    workOrderId: string;
    shiftId: string;
    roleId: string;
    workerId: string;
    status: ShiftWorkerConfirmationStatus;
    respondedAt?: string;
    requestedAt?: string;
    notificationChannel?: string;
  }): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const shiftRepo = manager.getRepository(WorkOrderShift);
      const roleRepo = manager.getRepository(WorkOrderShiftRole);
      const workerRepo = manager.getRepository(WorkOrderShiftRoleWorker);

      const shift = await shiftRepo.findOne({ where: { id: input.shiftId, workOrderId: input.workOrderId } });
      if (!shift) throw new Error(`Shift ${input.shiftId} not found for work order ${input.workOrderId}`);
      const role = await roleRepo.findOne({ where: { id: input.roleId, shiftId: shift.id } });
      if (!role) throw new Error(`Role ${input.roleId} not found for shift ${shift.id}`);

      const existing = await workerRepo.findOne({
        where: { roleId: role.id, workerId: input.workerId },
      });
      if (existing) {
        await workerRepo.update(
          { roleId: role.id, workerId: input.workerId },
          {
            confirmationStatus: input.status,
            ...(input.respondedAt !== undefined ? { respondedAt: new Date(input.respondedAt) } : {}),
            ...(input.requestedAt !== undefined ? { requestedAt: new Date(input.requestedAt) } : {}),
            ...(input.notificationChannel !== undefined
              ? { notificationChannel: input.notificationChannel }
              : {}),
          },
        );
      } else {
        await workerRepo.insert({
          roleId: role.id,
          workerId: input.workerId,
          confirmationStatus: input.status,
          respondedAt: input.respondedAt ? new Date(input.respondedAt) : null,
          requestedAt: input.requestedAt ? new Date(input.requestedAt) : null,
          notificationChannel: input.notificationChannel ?? null,
        } as any);
      }
    });
  }

  /** Delete all shifts/roles/assignments for a work order. */
  async deleteShiftsForWorkOrder(workOrderId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const shiftRepo = manager.getRepository(WorkOrderShift);
      const roleRepo = manager.getRepository(WorkOrderShiftRole);
      const workerRepo = manager.getRepository(WorkOrderShiftRoleWorker);

      const shifts = await shiftRepo.find({ where: { workOrderId } });
      const shiftIds = shifts.map((s) => s.id);
      if (shiftIds.length === 0) return;

      const roles = await roleRepo.find({ where: { shiftId: In(shiftIds) } });
      const roleIds = roles.map((r) => r.id);
      if (roleIds.length > 0) {
        await workerRepo.delete({ roleId: In(roleIds) });
        await roleRepo.delete({ id: In(roleIds) });
      }
      await shiftRepo.delete({ id: In(shiftIds) });
    });
  }

  /**
   * Update the user-pickable manual status of a single shift
   * (`customer_pending` | `dispatch_pending` | `ready_to_notify`).
   * Returns the updated row, or null if the shift does not exist.
   */
  async setShiftManualStatus(input: {
    workOrderId: string;
    shiftId: string;
    status: string;
  }): Promise<WorkOrderShift | null> {
    const allowed = ['', 'customer_pending', 'dispatch_pending', 'ready_to_notify'];
    const next = (input.status || '').trim().toLowerCase();
    if (!allowed.includes(next)) {
      throw new Error(
        `Invalid manual shift status '${input.status}'. Allowed: ${allowed.join(', ')}`,
      );
    }
    const shift = await this.shiftsRepo.findOne({
      where: { id: input.shiftId, workOrderId: input.workOrderId },
    });
    if (!shift) return null;
    shift.status = next || null;
    await this.shiftsRepo.save(shift);
    return shift;
  }

  /**
   * Mark a shift as manually cancelled (sets `cancelled = true`).
   * Reversible: calling `restoreShift` flips the flag back to false.
   */
  async cancelShift(input: {
    workOrderId: string;
    shiftId: string;
  }): Promise<WorkOrderShift | null> {
    const shift = await this.shiftsRepo.findOne({
      where: { id: input.shiftId, workOrderId: input.workOrderId },
    });
    if (!shift) return null;
    shift.cancelled = true;
    await this.shiftsRepo.save(shift);
    return shift;
  }

  async restoreShift(input: {
    workOrderId: string;
    shiftId: string;
  }): Promise<WorkOrderShift | null> {
    const shift = await this.shiftsRepo.findOne({
      where: { id: input.shiftId, workOrderId: input.workOrderId },
    });
    if (!shift) return null;
    shift.cancelled = false;
    await this.shiftsRepo.save(shift);
    return shift;
  }

  async approveShift(input: {
    workOrderId: string;
    shiftId: string;
    userId: string;
  }): Promise<WorkOrderShift | null> {
    const shift = await this.shiftsRepo.findOne({
      where: { id: input.shiftId, workOrderId: input.workOrderId },
    });
    if (!shift) return null;
    shift.pmApprovedAt = new Date();
    shift.pmApprovedByUserId = input.userId;
    return this.shiftsRepo.save(shift);
  }

  async reopenApprovedShift(input: {
    workOrderId: string;
    shiftId: string;
  }): Promise<WorkOrderShift | null> {
    const shift = await this.shiftsRepo.findOne({
      where: { id: input.shiftId, workOrderId: input.workOrderId },
    });
    if (!shift) return null;
    shift.pmApprovedAt = null;
    shift.pmApprovedByUserId = null;
    return this.shiftsRepo.save(shift);
  }

  /** Build the ShiftWriteInput[] payload from a JSON array (for legacy fallbacks). */
  static fromJson(workOrderId: string, json: unknown): ShiftWriteInput[] {
    if (!Array.isArray(json)) return [];
    return json.map((raw: Record<string, unknown>) => {
      const id = String(raw.id ?? '').trim();
      const date = String(raw.date ?? '').trim();
      const startTime = String(raw.startTime ?? '').trim();
      const endTime = String(raw.endTime ?? '').trim();
      const roles = Array.isArray(raw.roles) ? raw.roles : [];
      return {
        id,
        shiftName: String(raw.shiftName ?? '').trim(),
        date,
        startTime,
        endTime,
        status: typeof raw.status === 'string' ? raw.status : '',
        confirmationResetReason:
          typeof raw.confirmationResetReason === 'string'
            ? raw.confirmationResetReason
            : null,
        cancelled: raw.cancelled === true,
        pmApprovedAt:
          typeof raw.pmApprovedAt === 'string' ? raw.pmApprovedAt : null,
        pmApprovedByUserId:
          typeof raw.pmApprovedByUserId === 'string' ? raw.pmApprovedByUserId : null,
        createdByUserId: typeof raw.createdByUserId === 'string' ? raw.createdByUserId : null,
        requesterUserId: typeof raw.requesterUserId === 'string' ? raw.requesterUserId : null,
        address: typeof raw.address === 'string' ? raw.address : null,
        crossStreetLocationDetail: typeof raw.crossStreetLocationDetail === 'string' ? raw.crossStreetLocationDetail : null,
        addressLatitude: typeof raw.addressLatitude === 'number' ? raw.addressLatitude : null,
        addressLongitude: typeof raw.addressLongitude === 'number' ? raw.addressLongitude : null,
        addressCity: typeof raw.addressCity === 'string' ? raw.addressCity : null,
        addressState: typeof raw.addressState === 'string' ? raw.addressState : null,
        addressZipCode: typeof raw.addressZipCode === 'string' ? raw.addressZipCode : null,
        addressCountry: typeof raw.addressCountry === 'string' ? raw.addressCountry : null,
        requesterName: typeof raw.requesterName === 'string' ? raw.requesterName : null,
        requesterPhone: typeof raw.requesterPhone === 'string' ? raw.requesterPhone : null,
        requesterEmail: typeof raw.requesterEmail === 'string' ? raw.requesterEmail : null,
        visibleDocumentTypes: Array.isArray(raw.visibleDocumentTypes) ? raw.visibleDocumentTypes as string[] : [],
        notes: typeof raw.notes === 'string' ? raw.notes : null,
        clientTimesheetNotes:
          typeof raw.clientTimesheetNotes === 'string' ? raw.clientTimesheetNotes : '',
        internalTimesheetNotes:
          typeof raw.internalTimesheetNotes === 'string' ? raw.internalTimesheetNotes : '',
        plannedEquipment: Array.isArray(raw.plannedEquipment) ? raw.plannedEquipment : [],
        plannedMaterials: Array.isArray(raw.plannedMaterials) ? raw.plannedMaterials : [],
        workOrderTypes: Array.isArray(raw.workOrderTypes)
          ? raw.workOrderTypes.filter((value): value is string => typeof value === 'string')
          : [],
        workOrderAuthorizedWorkerIds: Array.isArray(raw.workOrderAuthorizedWorkerIds)
          ? raw.workOrderAuthorizedWorkerIds.filter(
              (workerId): workerId is string => typeof workerId === 'string',
            )
          : [],
        defaultRoleStartTime:
          typeof raw.defaultRoleStartTime === 'string' ? raw.defaultRoleStartTime : null,
        shiftTemplateId:
          typeof raw.shiftTemplateId === 'string' ? raw.shiftTemplateId : null,
        roles: roles.map((rawRole: Record<string, unknown>) => {
          const assignedWorkers = Array.isArray(rawRole.assignedWorkers)
            ? (rawRole.assignedWorkers as string[])
            : [];
          const confirmations = Array.isArray(rawRole.workerConfirmations)
            ? (rawRole.workerConfirmations as Record<string, unknown>[])
            : [];
          const byWorker = new Map(confirmations.map((c) => [String(c.workerId ?? ''), c]));
          return {
            id: String(rawRole.id ?? '').trim(),
            roleName: String(rawRole.roleName ?? 'Worker'),
            requiredCount:
              typeof rawRole.requiredCount === 'number' ? rawRole.requiredCount : 1,
            startTime: typeof rawRole.startTime === 'string' ? rawRole.startTime : null,
            requiredCertificationIds: Array.isArray(rawRole.requiredCertificationIds)
              ? (rawRole.requiredCertificationIds as string[])
              : [],
            requiredSkillIds: Array.isArray(rawRole.requiredSkillIds)
              ? (rawRole.requiredSkillIds as string[])
              : [],
            assignedWorkers: assignedWorkers.map((workerId) => {
              const conf = byWorker.get(workerId);
              return {
                workerId,
                status:
                  (conf?.status as ShiftWorkerConfirmationStatus | undefined) ?? 'pending',
                respondedAt:
                  typeof conf?.respondedAt === 'string' ? conf.respondedAt : null,
                requestedAt:
                  typeof conf?.requestedAt === 'string' ? conf.requestedAt : null,
                notificationChannel:
                  typeof conf?.notificationChannel === 'string'
                    ? conf.notificationChannel
                    : null,
              };
            }),
          };
        }),
      };
    });
  }
}
