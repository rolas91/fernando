import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkOrderShift } from '../../entities/work-order-shift.entity';
import { WorkOrderShiftRole } from '../../entities/work-order-shift-role.entity';
import { WorkOrderShiftRoleWorker } from '../../entities/work-order-shift-role-worker.entity';
import { WorkOrderShiftRoleEquipment } from '../../entities/work-order-shift-role-equipment.entity';
import { WorkOrderShiftRoleMaterial } from '../../entities/work-order-shift-role-material.entity';
import { AppDataSource } from '../data-source';

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
    @InjectRepository(WorkOrderShiftRoleEquipment)
    private readonly equipmentAssignmentsRepo: Repository<WorkOrderShiftRoleEquipment>,
    @InjectRepository(WorkOrderShiftRoleMaterial)
    private readonly materialAssignmentsRepo: Repository<WorkOrderShiftRoleMaterial>,
  ) {}

  async loadShiftsForWorkOrder(workOrderId: string): Promise<Record<string, unknown>[] | null> {
    const shiftRows = await this.shiftsRepo.find({
      where: { workOrderId },
      order: { date: 'ASC' },
    });
    if (shiftRows.length === 0) return null;

    const roleRows = await this.rolesRepo
      .createQueryBuilder('role')
      .innerJoin('work_order_shifts', 'shift', 'shift.id = role.shift_id')
      .where('shift.work_order_id = :workOrderId', { workOrderId })
      .orderBy('role.id', 'ASC')
      .getMany();

    const [workerRows, equipmentRows, materialRows] = await Promise.all([
      this.workerAssignmentsRepo
        .createQueryBuilder('w')
        .innerJoin('work_order_shift_roles', 'role', 'role.id = w.role_id')
        .innerJoin('work_order_shifts', 'shift', 'shift.id = role.shift_id')
        .where('shift.work_order_id = :workOrderId', { workOrderId })
        .getMany(),
      this.equipmentAssignmentsRepo
        .createQueryBuilder('e')
        .innerJoin('work_order_shift_roles', 'role', 'role.id = e.role_id')
        .innerJoin('work_order_shifts', 'shift', 'shift.id = role.shift_id')
        .where('shift.work_order_id = :workOrderId', { workOrderId })
        .getMany(),
      this.materialAssignmentsRepo
        .createQueryBuilder('m')
        .innerJoin('work_order_shift_roles', 'role', 'role.id = m.role_id')
        .innerJoin('work_order_shifts', 'shift', 'shift.id = role.shift_id')
        .where('shift.work_order_id = :workOrderId', { workOrderId })
        .getMany(),
    ]);

    const workerByRole = new Map<string, WorkOrderShiftRoleWorker[]>();
    for (const w of workerRows) {
      const list = workerByRole.get(w.roleId) ?? [];
      list.push(w);
      workerByRole.set(w.roleId, list);
    }
    const equipmentByRole = new Map<string, string[]>();
    for (const e of equipmentRows) {
      const list = equipmentByRole.get(e.roleId) ?? [];
      list.push(e.equipmentId);
      equipmentByRole.set(e.roleId, list);
    }
    const materialByRole = new Map<string, string[]>();
    for (const m of materialRows) {
      const list = materialByRole.get(m.roleId) ?? [];
      list.push(m.materialId);
      materialByRole.set(m.roleId, list);
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
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
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
            assignedEquipment: [...(equipmentByRole.get(role.id) ?? [])],
            assignedMaterials: [...(materialByRole.get(role.id) ?? [])],
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

  async hasRelationalData(workOrderId: string): Promise<boolean> {
    const count = await this.shiftsRepo.count({ where: { workOrderId } });
    return count > 0;
  }
}

async function main() {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();

  const svc = new ShiftsQueryService(
    AppDataSource.getRepository(WorkOrderShift),
    AppDataSource.getRepository(WorkOrderShiftRole),
    AppDataSource.getRepository(WorkOrderShiftRoleWorker),
    AppDataSource.getRepository(WorkOrderShiftRoleEquipment),
    AppDataSource.getRepository(WorkOrderShiftRoleMaterial),
  );

  const result = await svc.loadShiftsForWorkOrder('wo_demo_asn_2026_856');
  console.log('=== ShiftsQueryService output (from tables) ===');
  console.log(JSON.stringify(result, null, 2));

  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
