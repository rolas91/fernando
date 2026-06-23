import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkOrderShiftRole } from './work-order-shift-role.entity';
import { Worker } from './worker.entity';

export type ShiftWorkerConfirmationStatus = 'pending' | 'confirmed' | 'declined';

@Entity('work_order_shift_role_workers')
@Index('idx_wosrw_role', ['roleId'])
@Index('idx_wosrw_worker', ['workerId'])
@Index('idx_wosrw_role_worker', ['roleId', 'workerId'])
export class WorkOrderShiftRoleWorker {
  @PrimaryColumn({ name: 'role_id', type: 'varchar', length: 64 })
  roleId: string;

  @PrimaryColumn({ name: 'worker_id', type: 'varchar', length: 64 })
  workerId: string;

  @Column({
    name: 'confirmation_status',
    type: 'varchar',
    length: 24,
    default: 'pending',
  })
  confirmationStatus: ShiftWorkerConfirmationStatus;

  @Column({
    name: 'requested_at',
    type: 'timestamp',
    nullable: true,
  })
  requestedAt: Date | null;

  @Column({
    name: 'responded_at',
    type: 'timestamp',
    nullable: true,
  })
  respondedAt: Date | null;

  @Column({
    name: 'notification_channel',
    type: 'varchar',
    length: 24,
    nullable: true,
  })
  notificationChannel: string | null;

  @ManyToOne(() => WorkOrderShiftRole, (role) => role.workerAssignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'role_id' })
  role?: WorkOrderShiftRole;

  @ManyToOne(() => Worker, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worker_id' })
  worker?: Worker;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
