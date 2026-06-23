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
import { WorkOrder } from './work-order.entity';
import { WorkOrderShiftRole } from './work-order-shift-role.entity';

@Entity('work_order_shifts')
@Index('idx_work_order_shifts_work_order', ['workOrderId'])
export class WorkOrderShift {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ name: 'work_order_id', type: 'varchar', length: 64 })
  workOrderId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'start_time', type: 'varchar', length: 16, default: '' })
  startTime: string;

  @Column({ name: 'end_time', type: 'varchar', length: 16, default: '' })
  endTime: string;

  @Column({
    name: 'default_role_start_time',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  defaultRoleStartTime: string | null;

  @Column({
    name: 'shift_template_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  shiftTemplateId: string | null;

  @ManyToOne(() => WorkOrder, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'work_order_id' })
  workOrder?: WorkOrder;

  @OneToMany(() => WorkOrderShiftRole, (role) => role.shift, { cascade: true })
  roles?: WorkOrderShiftRole[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
