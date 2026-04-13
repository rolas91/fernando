import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('company_settings')
export class CompanySettings {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', default: '' })
  address: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  phone: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  email: string;

  @Column({ type: 'text', nullable: true })
  logo: string | null;

  @Column({ name: 'overtime_rules', type: 'jsonb', nullable: true })
  overtimeRules: Record<string, unknown> | null;

  @Column({ name: 'worker_types', type: 'text', array: true, default: '{}' })
  workerTypes: string[];

  @Column({ name: 'equipment_types', type: 'text', array: true, default: '{}' })
  equipmentTypes: string[];

  @Column({ name: 'job_statuses', type: 'text', array: true, default: '{}' })
  jobStatuses: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
