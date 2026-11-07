import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('commercial_invoices')
export class CommercialInvoice {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ name: 'invoice_number', type: 'varchar', length: 80, unique: true })
  invoiceNumber: string;

  @Column({ name: 'commercial_work_order_id', type: 'varchar', length: 64 })
  commercialWorkOrderId: string;

  @Column({ name: 'work_order_number', type: 'varchar', length: 80 })
  workOrderNumber: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 255, default: '' })
  customerName: string;

  @Column({ name: 'job_name', type: 'varchar', length: 255, default: '' })
  jobName: string;

  @Column({ type: 'varchar', length: 180, default: '' })
  contact: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  email: string;

  @Column({ name: 'billing_date', type: 'date' })
  billingDate: string;

  @Column({ name: 'next_invoice_date', type: 'date' })
  nextInvoiceDate: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'varchar', length: 32, default: 'generated' })
  status: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  items: Record<string, unknown>[];

  @Column({ name: 'created_by', type: 'varchar', length: 180, default: '' })
  createdBy: string;

  @Column({ name: 'pdf_html', type: 'text', default: '' })
  pdfHtml: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
