import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CommercialWorkOrderType = 'sale' | 'on_rent';
export type CommercialWorkOrderStatus =
  | 'draft'
  | 'sale_completed'
  | 'on_rent'
  | 'closed';

@Entity('commercial_work_orders')
export class CommercialWorkOrder {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ name: 'work_order_number', type: 'varchar', length: 80, unique: true })
  workOrderNumber: string;

  @Column({ type: 'varchar', length: 24 })
  type: CommercialWorkOrderType;

  @Column({ type: 'varchar', length: 32 })
  status: CommercialWorkOrderStatus;

  @Column({ name: 'parent_work_order_id', type: 'varchar', length: 64, nullable: true })
  parentWorkOrderId: string | null;

  @Column({ name: 'rollover_index', type: 'integer', default: 0 })
  rolloverIndex: number;

  @Column({ name: 'job_number', type: 'varchar', length: 120, default: '' })
  jobNumber: string;

  @Column({ name: 'job_name', type: 'varchar', length: 255, default: '' })
  jobName: string;

  @Column({ name: 'project_id', type: 'varchar', length: 64, default: '' })
  projectId: string;

  @Column({ name: 'customer_id', type: 'varchar', length: 64, default: '' })
  customerId: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 255, default: '' })
  customerName: string;

  @Column({ type: 'varchar', length: 180, default: '' })
  contact: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  phone: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  email: string;

  @Column({ name: 'customer_order_number', type: 'varchar', length: 120, default: '' })
  customerOrderNumber: string;

  @Column({ name: 'description_of_work', type: 'text', default: '' })
  descriptionOfWork: string;

  @Column({ name: 'work_date', type: 'date', nullable: true })
  workDate: string | null;

  @Column({ name: 'on_rent_date', type: 'date', nullable: true })
  onRentDate: string | null;

  @Column({ name: 'original_on_rent_date', type: 'date', nullable: true })
  originalOnRentDate: string | null;

  @Column({ name: 'previous_billing_date', type: 'date', nullable: true })
  previousBillingDate: string | null;

  @Column({ name: 'next_invoice_date', type: 'date', nullable: true })
  nextInvoiceDate: string | null;

  @Column({ name: 'off_rent_date', type: 'date', nullable: true })
  offRentDate: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  items: Record<string, unknown>[];

  @Column({ type: 'text', default: '' })
  notes: string;

  @Column({ name: 'created_by', type: 'varchar', length: 180, default: '' })
  createdBy: string;

  @Column({ name: 'pdf_html', type: 'text', default: '' })
  pdfHtml: string;

  @Column({ name: 'pdf_generated_at', type: 'timestamp', nullable: true })
  pdfGeneratedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
