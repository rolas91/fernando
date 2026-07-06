import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('work_order_sequences')
export class WorkOrderSequence {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  scope: string;

  @PrimaryColumn({ name: 'reset_key', type: 'varchar', length: 16 })
  resetKey: string;

  @Column({ name: 'last_value', type: 'int', default: 0 })
  lastValue: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
