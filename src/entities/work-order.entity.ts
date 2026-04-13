import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('work_orders')
export class WorkOrder {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ name: 'project_id', type: 'varchar', length: 64, default: '' })
  projectId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({
    name: 'order_number',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  orderNumber: string | null;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  shifts: Record<string, unknown>[];

  @Column({ type: 'text', default: '' })
  notes: string;

  @Column({ type: 'text', array: true, default: '{}' })
  attachments: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
