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

  @Column({ name: 'logo_icon', type: 'text', nullable: true })
  logoIcon: string | null;

  @Column({ name: 'overtime_rules', type: 'jsonb', nullable: true })
  overtimeRules: Record<string, unknown> | null;

  @Column({ name: 'worker_types', type: 'text', array: true, default: '{}' })
  workerTypes: string[];

  @Column({ name: 'equipment_types', type: 'text', array: true, default: '{}' })
  equipmentTypes: string[];

  @Column({ name: 'material_types', type: 'text', array: true, default: '{}' })
  materialTypes: string[];

  @Column({
    name: 'work_order_type_options',
    type: 'text',
    array: true,
    default: '{}',
  })
  workOrderTypeOptions: string[];

  @Column({ name: 'job_statuses', type: 'text', array: true, default: '{}' })
  jobStatuses: string[];

  @Column({ name: 'work_order_pdf_builder', type: 'jsonb', nullable: true })
  workOrderPdfBuilder: Record<string, unknown> | null;

  /*
   * Retired: assignment_auto_status remains as an unused database column so
   * existing installations do not require a destructive migration.
   */

  @Column({ name: 'minimum_rest_hours', type: 'numeric', precision: 4, scale: 1, default: 8.0 })
  minimumRestHours: number;

  @Column({
    name: 'work_order_number_prefix',
    type: 'varchar',
    length: 16,
    default: 'ASN',
  })
  workOrderNumberPrefix: string;

  @Column({ name: 'work_order_number_padding', type: 'int', default: 4 })
  workOrderNumberPadding: number;

  @Column({
    name: 'work_order_number_reset',
    type: 'varchar',
    length: 16,
    default: 'yearly',
  })
  workOrderNumberReset: 'never' | 'yearly' | 'monthly';

  @Column({
    name: 'work_order_number_template',
    type: 'varchar',
    length: 64,
    default: '{PREFIX}-{YYYY}-{NNNN}',
  })
  workOrderNumberTemplate: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
