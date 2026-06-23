import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkOrderShift } from './work-order-shift.entity';
import { WorkOrderShiftRoleWorker } from './work-order-shift-role-worker.entity';
import { WorkOrderShiftRoleEquipment } from './work-order-shift-role-equipment.entity';
import { WorkOrderShiftRoleMaterial } from './work-order-shift-role-material.entity';

@Entity('work_order_shift_roles')
@Index('idx_work_order_shift_roles_shift', ['shiftId'])
export class WorkOrderShiftRole {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ name: 'shift_id', type: 'varchar', length: 64 })
  shiftId: string;

  @Column({ name: 'role_name', type: 'varchar', length: 180 })
  roleName: string;

  @Column({ name: 'required_count', type: 'int', default: 1 })
  requiredCount: number;

  @Column({ name: 'start_time', type: 'varchar', length: 16, nullable: true })
  startTime: string | null;

  @Column({
    name: 'required_certification_ids',
    type: 'text',
    array: true,
    default: '{}',
  })
  requiredCertificationIds: string[];

  @Column({
    name: 'required_skill_ids',
    type: 'text',
    array: true,
    default: '{}',
  })
  requiredSkillIds: string[];

  @ManyToOne(() => WorkOrderShift, (shift) => shift.roles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'shift_id' })
  shift?: WorkOrderShift;

  @OneToMany(() => WorkOrderShiftRoleWorker, (w) => w.role, { cascade: true })
  workerAssignments?: WorkOrderShiftRoleWorker[];

  @OneToMany(
    () => WorkOrderShiftRoleEquipment,
    (e) => e.role,
    { cascade: true },
  )
  equipmentAssignments?: WorkOrderShiftRoleEquipment[];

  @OneToMany(
    () => WorkOrderShiftRoleMaterial,
    (m) => m.role,
    { cascade: true },
  )
  materialAssignments?: WorkOrderShiftRoleMaterial[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
