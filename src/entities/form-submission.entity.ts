import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('form_submissions')
export class FormSubmission {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ name: 'template_id', type: 'varchar', length: 64, default: '' })
  templateId: string;

  @Column({ name: 'project_id', type: 'varchar', length: 64, default: '' })
  projectId: string;

  @Column({ name: 'work_order_id', type: 'varchar', length: 64, default: '' })
  workOrderId: string;

  @Column({ name: 'shift_id', type: 'varchar', length: 64, default: '' })
  shiftId: string;

  @Column({ name: 'worker_id', type: 'varchar', length: 64, default: '' })
  workerId: string;

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  data: Record<string, unknown>;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ name: 'pdf_url', type: 'text', default: '' })
  pdfUrl: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
