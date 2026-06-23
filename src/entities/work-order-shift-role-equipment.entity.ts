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
import { Equipment } from './equipment.entity';

@Entity('work_order_shift_role_equipment')
export class WorkOrderShiftRoleEquipment {
  @PrimaryColumn({ name: 'role_id', type: 'varchar', length: 64 })
  roleId: string;

  @PrimaryColumn({ name: 'equipment_id', type: 'varchar', length: 64 })
  equipmentId: string;

  @ManyToOne(() => WorkOrderShiftRole, (role) => role.equipmentAssignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'role_id' })
  role?: WorkOrderShiftRole;

  @ManyToOne(() => Equipment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equipment_id' })
  equipment?: Equipment;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
