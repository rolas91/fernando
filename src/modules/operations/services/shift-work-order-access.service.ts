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

  async canManageShiftWorkOrder(
    actor: UserAccessContext | undefined,
    workOrderId: string | undefined,
    shiftId: string | undefined,
  ): Promise<boolean> {
    if (!actor) return false;
    if (this.hasGlobalAccess(actor)) return true;

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
