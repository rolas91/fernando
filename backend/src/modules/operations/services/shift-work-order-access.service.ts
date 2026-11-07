import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';
import { WorkOrderShiftRole } from '../../../entities/work-order-shift-role.entity';
import { WorkOrderShiftRoleWorker } from '../../../entities/work-order-shift-role-worker.entity';
import { Worker } from '../../../entities/worker.entity';
import type { UserAccessContext } from '../../access/ports/access.port';

@Injectable()
export class ShiftWorkOrderAccessService {
  constructor(
    @InjectRepository(Worker)
    private readonly workersRepo: Repository<Worker>,
    @InjectRepository(WorkOrderShift)
    private readonly shiftsRepo: Repository<WorkOrderShift>,
    @InjectRepository(WorkOrderShiftRole)
    private readonly rolesRepo: Repository<WorkOrderShiftRole>,
    @InjectRepository(WorkOrderShiftRoleWorker)
    private readonly roleWorkersRepo: Repository<WorkOrderShiftRoleWorker>,
  ) {}

  hasGlobalAccess(actor?: UserAccessContext): boolean {
    const permissions = actor?.permissions ?? [];
    return (
      permissions.includes('form-submissions.write') ||
      permissions.includes('mobile.work-orders.submit')
    );
  }

  isAdmin(actor?: UserAccessContext): boolean {
    return Boolean(
      actor &&
      (actor.role === 'admin' || (actor.roles ?? []).includes('admin')),
    );
  }

  async isShiftPmApproved(
    workOrderId?: string,
    shiftId?: string,
  ): Promise<boolean> {
    const normalizedWorkOrderId = workOrderId?.trim();
    const normalizedShiftId = shiftId?.trim();
    if (!normalizedWorkOrderId || !normalizedShiftId) return false;

    const shift = await this.shiftsRepo.findOne({
      where: {
        id: normalizedShiftId,
        workOrderId: normalizedWorkOrderId,
      },
      select: { id: true, pmApprovedAt: true },
    });
    return Boolean(shift?.pmApprovedAt);
  }

  async canManageShiftWorkOrder(
    actor: UserAccessContext | undefined,
    workOrderId: string | undefined,
    shiftId: string | undefined,
  ): Promise<boolean> {
    if (!actor) return false;
    if (this.hasGlobalAccess(actor)) return true;
    return this.hasShiftWorkOrderAssignment(actor, workOrderId, shiftId);
  }

  /**
   * Strict Work Order ownership: the designated shift manager or an admin.
   * Global mobile Work Order permissions are intentionally ignored.
   */
  async canManageShiftWorkOrderAsOwner(
    actor: UserAccessContext | undefined,
    workOrderId: string | undefined,
    shiftId: string | undefined,
  ): Promise<boolean> {
    if (!actor) return false;
    if (this.isAdmin(actor)) return true;
    return this.hasShiftWorkOrderAssignment(actor, workOrderId, shiftId);
  }

  /**
   * Editing an already submitted Work Order is stricter than submitting it:
   * only the worker designated as the shift Work Order manager or an admin may
   * reopen it. Global mobile Work Order permissions are intentionally ignored.
   */
  async canEditSubmittedShiftWorkOrder(
    actor: UserAccessContext | undefined,
    workOrderId: string | undefined,
    shiftId: string | undefined,
  ): Promise<boolean> {
    if (!actor) return false;
    if (await this.isShiftPmApproved(workOrderId, shiftId)) return false;
    return this.canManageShiftWorkOrderAsOwner(actor, workOrderId, shiftId);
  }

  async assertCanEditSubmittedShiftWorkOrder(
    actor: UserAccessContext | undefined,
    workOrderId: string | undefined,
    shiftId: string | undefined,
  ): Promise<void> {
    if (
      await this.canEditSubmittedShiftWorkOrder(actor, workOrderId, shiftId)
    ) {
      return;
    }
    throw new ForbiddenException(
      'Only the Work Order manager or an administrator can edit a submitted Work Order.',
    );
  }

  private async hasShiftWorkOrderAssignment(
    actor: UserAccessContext,
    workOrderId: string | undefined,
    shiftId: string | undefined,
  ): Promise<boolean> {
    const normalizedWorkOrderId = workOrderId?.trim();
    const normalizedShiftId = shiftId?.trim();
    const email = actor.email?.trim();
    if (!normalizedWorkOrderId || !normalizedShiftId || !email) return false;

    const worker = await this.workersRepo.findOne({
      where: { email: ILike(email) },
    });
    if (!worker) return false;

    const shift = await this.shiftsRepo.findOne({
      where: {
        id: normalizedShiftId,
        workOrderId: normalizedWorkOrderId,
      },
    });
    if (
      !shift ||
      !Array.isArray(shift.workOrderAuthorizedWorkerIds) ||
      !shift.workOrderAuthorizedWorkerIds.includes(worker.id)
    ) {
      return false;
    }

    const roles = await this.rolesRepo.find({
      where: { shiftId: normalizedShiftId },
      select: { id: true },
    });
    const roleIds = roles.map((role) => role.id);
    if (!roleIds.length) return false;

    return Boolean(
      await this.roleWorkersRepo.findOne({
        where: {
          roleId: In(roleIds),
          workerId: worker.id,
        },
        select: { roleId: true, workerId: true },
      }),
    );
  }

  async assertCanManageShiftWorkOrder(
    actor: UserAccessContext | undefined,
    workOrderId: string | undefined,
    shiftId: string | undefined,
  ): Promise<void> {
    if (await this.canManageShiftWorkOrder(actor, workOrderId, shiftId)) return;
    throw new ForbiddenException(
      'You do not have permission to submit or edit the work order form for this shift.',
    );
  }
}
