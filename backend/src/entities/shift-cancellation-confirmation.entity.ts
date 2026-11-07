import { Column, Entity, PrimaryColumn } from 'typeorm';

// Kept independently of inbox notifications and assignment acceptance.
@Entity('shift_cancellation_confirmations')
export class ShiftCancellationConfirmation {
  @PrimaryColumn({ name: 'work_order_id', type: 'varchar', length: 64 })
  workOrderId: string;

  @PrimaryColumn({ name: 'shift_id', type: 'varchar', length: 64 })
  shiftId: string;

  @PrimaryColumn({ name: 'worker_id', type: 'varchar', length: 64 })
  workerId: string;

  @Column({ name: 'notification_id', type: 'varchar', length: 64 })
  notificationId: string;

  @Column({ name: 'acknowledged_at', type: 'timestamp', nullable: true })
  acknowledgedAt: Date | null;
}
