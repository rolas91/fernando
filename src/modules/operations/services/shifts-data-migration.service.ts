import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { WorkOrder } from '../../../entities/work-order.entity';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';
import { WorkOrderShiftRole } from '../../../entities/work-order-shift-role.entity';
import { WorkOrderShiftRoleWorker, type ShiftWorkerConfirmationStatus } from '../../../entities/work-order-shift-role-worker.entity';
import { WorkOrderShiftRoleEquipment } from '../../../entities/work-order-shift-role-equipment.entity';
import { WorkOrderShiftRoleMaterial } from '../../../entities/work-order-shift-role-material.entity';

/**
 * Phase 3 migration helper. Reads every work order's `shifts` JSON column and
 * writes the equivalent rows to the new relational tables. Safe to run
 * multiple times: existing rows for a (shift, role, worker) are skipped.
 *
 * Triggered by: `npm run migration:relational-shifts` (added in a follow-up).
 */
@Injectable()
export class ShiftsDataMigrationService {
  private readonly logger = new Logger(ShiftsDataMigrationService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(WorkOrder)
    private readonly workOrdersRepo: Repository<WorkOrder>,
  ) {}

  async run(): Promise<{ workOrdersProcessed: number; shiftsCreated: number; rolesCreated: number; workerAssignmentsCreated: number; equipmentAssignmentsCreated: number; materialAssignmentsCreated: number; errors: number }> {
    const shiftsRepo = this.dataSource.getRepository(WorkOrderShift);
    const rolesRepo = this.dataSource.getRepository(WorkOrderShiftRole);
    const workerRepo = this.dataSource.getRepository(WorkOrderShiftRoleWorker);
    const equipmentRepo = this.dataSource.getRepository(WorkOrderShiftRoleEquipment);
    const materialRepo = this.dataSource.getRepository(WorkOrderShiftRoleMaterial);

    const workOrders = await this.workOrdersRepo.find();
    const result = {
      workOrdersProcessed: 0,
      shiftsCreated: 0,
      rolesCreated: 0,
      workerAssignmentsCreated: 0,
      equipmentAssignmentsCreated: 0,
      materialAssignmentsCreated: 0,
      errors: 0,
    };

    for (const workOrder of workOrders) {
      const shifts = Array.isArray(workOrder.shifts) ? workOrder.shifts : [];
      if (shifts.length === 0) continue;
      result.workOrdersProcessed++;

      for (const shift of shifts) {
        const shiftId = typeof shift.id === 'string' ? shift.id : '';
        if (!shiftId) continue;
        const exists = await shiftsRepo.exist({ where: { id: shiftId } });
        if (!exists) {
          await shiftsRepo.insert({
            id: shiftId,
            workOrderId: workOrder.id,
            date: typeof shift.date === 'string' ? shift.date : new Date().toISOString().slice(0, 10),
            startTime: typeof shift.startTime === 'string' ? shift.startTime : '',
            endTime: typeof shift.endTime === 'string' ? shift.endTime : '',
            defaultRoleStartTime: typeof shift.defaultRoleStartTime === 'string' ? shift.defaultRoleStartTime : null,
            shiftTemplateId: typeof shift.shiftTemplateId === 'string' ? shift.shiftTemplateId : null,
          });
          result.shiftsCreated++;
        }

        const roles = Array.isArray(shift.roles) ? shift.roles : [];
        for (const role of roles) {
          const roleId = typeof role.id === 'string' ? role.id : '';
          if (!roleId) continue;
          const roleExists = await rolesRepo.exist({ where: { id: roleId } });
          if (!roleExists) {
            await rolesRepo.insert({
              id: roleId,
              shiftId,
              roleName: typeof role.roleName === 'string' ? role.roleName : 'Worker',
              requiredCount: typeof role.requiredCount === 'number' ? role.requiredCount : 1,
              startTime: typeof role.startTime === 'string' ? role.startTime : null,
              requiredCertificationIds: Array.isArray(role.requiredCertificationIds)
                ? role.requiredCertificationIds.map((v) => String(v))
                : [],
              requiredSkillIds: Array.isArray(role.requiredSkillIds)
                ? role.requiredSkillIds.map((v) => String(v))
                : [],
            });
            result.rolesCreated++;
          }

          const assignedWorkers = Array.isArray(role.assignedWorkers)
            ? role.assignedWorkers.map((v) => String(v)).filter(Boolean)
            : [];
          const confirmations = Array.isArray(role.workerConfirmations)
            ? role.workerConfirmations
            : [];
          for (const workerId of assignedWorkers) {
            const exists = await workerRepo.exist({ where: { roleId, workerId } });
            if (exists) continue;
            const conf = confirmations.find(
              (c) => c && typeof c === 'object' && (c as { workerId?: string }).workerId === workerId,
            ) as { status?: string; requestedAt?: string; respondedAt?: string; notificationChannel?: string } | undefined;
            const status: ShiftWorkerConfirmationStatus =
              conf?.status === 'confirmed' || conf?.status === 'declined' || conf?.status === 'pending'
                ? conf.status
                : 'pending';
            await workerRepo.insert({
              roleId,
              workerId,
              confirmationStatus: status,
              requestedAt: conf?.requestedAt ? new Date(conf.requestedAt) : null,
              respondedAt: conf?.respondedAt ? new Date(conf.respondedAt) : null,
              notificationChannel: conf?.notificationChannel ?? null,
            });
            result.workerAssignmentsCreated++;
          }

          const assignedEquipment = Array.isArray(role.assignedEquipment)
            ? role.assignedEquipment.map((v) => String(v)).filter(Boolean)
            : [];
          for (const equipmentId of assignedEquipment) {
            const exists = await equipmentRepo.exist({ where: { roleId, equipmentId } });
            if (exists) continue;
            await equipmentRepo.insert({ roleId, equipmentId });
            result.equipmentAssignmentsCreated++;
          }

          const assignedMaterials = Array.isArray(role.assignedMaterials)
            ? role.assignedMaterials.map((v) => String(v)).filter(Boolean)
            : [];
          for (const materialId of assignedMaterials) {
            const exists = await materialRepo.exist({ where: { roleId, materialId } });
            if (exists) continue;
            await materialRepo.insert({ roleId, materialId });
            result.materialAssignmentsCreated++;
          }
        }
      }
    }

    this.logger.log(`Migration complete: ${JSON.stringify(result)}`);
    return result;
  }
}
