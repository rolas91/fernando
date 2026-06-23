import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkOrderShiftRole } from './work-order-shift-role.entity';
import { Material } from './material.entity';

@Entity('work_order_shift_role_materials')
export class WorkOrderShiftRoleMaterial {
  @PrimaryColumn({ name: 'role_id', type: 'varchar', length: 64 })
  roleId: string;

  @PrimaryColumn({ name: 'material_id', type: 'varchar', length: 64 })
  materialId: string;

  @ManyToOne(() => WorkOrderShiftRole, (role) => role.materialAssignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'role_id' })
  role?: WorkOrderShiftRole;

  @ManyToOne(() => Material, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'material_id' })
  material?: Material;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
