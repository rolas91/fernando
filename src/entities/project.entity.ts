import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('projects')
export class Project {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 80, default: '' })
  number: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'client_id', type: 'varchar', length: 64, default: '' })
  clientId: string;

  @Column({ type: 'text', default: '' })
  location: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  city: string;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  @Column({
    name: 'work_order_number',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  workOrderNumber: string | null;

  @Column({
    name: 'purchase_order',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  purchaseOrder: string | null;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'text', default: '' })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
