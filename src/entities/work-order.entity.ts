import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
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

  @Column({
    name: 'work_order_type_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  workOrderTypeId: string | null;

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

  shifts?: Record<string, unknown>[];

  @Column({ name: 'requester_name', type: 'varchar', length: 180, default: '' })
  requesterName: string;

  @Column({ name: 'contact_email', type: 'varchar', length: 255, default: '' })
  contactEmail: string;

  @Column({
    name: 'contact_phone_number',
    type: 'varchar',
    length: 64,
    default: '',
  })
  contactPhoneNumber: string;

  @Column({ name: 'assignment_address', type: 'text', default: '' })
  assignmentAddress: string;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  @Column({ name: 'assignment_city', type: 'varchar', length: 180, default: '' })
  assignmentCity: string;

  @Column({ name: 'assignment_state', type: 'varchar', length: 120, default: '' })
  assignmentState: string;

  @Column({ name: 'assignment_zip_code', type: 'varchar', length: 32, default: '' })
  assignmentZipCode: string;

  @Column({ name: 'assignment_country', type: 'varchar', length: 120, default: 'USA' })
  assignmentCountry: string;

  @Column({ type: 'text', default: '' })
  notes: string;

  @Column({ name: 'dispatch_note', type: 'text', default: '' })
  dispatchNote: string;

  @Column({ name: 'file_uploads', type: 'text', array: true, default: '{}' })
  fileUploads: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  attachments: string[];

  /** Form templates selectable for this assignment (mobile/forms); vacío = no filtra por lista */
  @Column({ name: 'form_template_ids', type: 'text', array: true, default: '{}' })
  formTemplateIds: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;
}
