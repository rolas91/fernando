import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('notifications')
export class Notification {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 32 })
  type: string;

  @Column({ type: 'varchar', length: 32, default: 'in_app' })
  channel: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', default: '' })
  message: string;

  @Column({ type: 'timestamp', nullable: true })
  timestamp: Date | null;

  @Column({ type: 'boolean', default: false })
  read: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  link: string | null;

  @Column({ name: 'worker_id', type: 'varchar', length: 64, nullable: true })
  workerId: string | null;

  @Column({ name: 'work_order_id', type: 'varchar', length: 64, nullable: true })
  workOrderId: string | null;

  @Column({ name: 'shift_id', type: 'varchar', length: 64, nullable: true })
  shiftId: string | null;

  @Column({ name: 'role_id', type: 'varchar', length: 64, nullable: true })
  roleId: string | null;

  @Column({ name: 'delivery_status', type: 'varchar', length: 64, nullable: true })
  deliveryStatus: string | null;

  @Column({ name: 'provider_message_id', type: 'text', nullable: true })
  providerMessageId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
