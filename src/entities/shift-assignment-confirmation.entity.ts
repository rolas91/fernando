import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('shift_assignment_confirmations')
@Index('IDX_shift_assignment_confirmations_token', ['token'], { unique: true })
@Index(
  'IDX_shift_assignment_confirmations_assignment',
  ['workOrderId', 'shiftId', 'roleId', 'workerId'],
  { unique: true },
)
export class ShiftAssignmentConfirmation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'work_order_id', type: 'varchar', length: 64 })
  workOrderId: string;

  @Column({ name: 'shift_id', type: 'varchar', length: 64 })
  shiftId: string;

  @Column({ name: 'role_id', type: 'varchar', length: 64 })
  roleId: string;

  @Column({ name: 'worker_id', type: 'varchar', length: 64 })
  workerId: string;

  @Column({ type: 'varchar', length: 160 })
  token: string;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status: string;

  @Column({ name: 'delivery_channel', type: 'varchar', length: 32, nullable: true })
  deliveryChannel: string | null;

  @Column({ name: 'requested_at', type: 'timestamp', nullable: true })
  requestedAt: Date | null;

  @Column({ name: 'responded_at', type: 'timestamp', nullable: true })
  respondedAt: Date | null;

  @Column({ name: 'last_message', type: 'text', default: '' })
  lastMessage: string;

  @Column({ name: 'last_sent_to', type: 'varchar', length: 255, nullable: true })
  lastSentTo: string | null;

  @Column({
    name: 'provider_message_sid',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  providerMessageSid: string | null;

  @Column({
    name: 'delivery_status',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  deliveryStatus: string | null;

  @Column({ name: 'delivery_error', type: 'text', nullable: true })
  deliveryError: string | null;

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
