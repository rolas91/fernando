import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TimesheetVariant = 'client' | 'internal';

@Entity('timesheets')
export class Timesheet {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ name: 'worker_id', type: 'varchar', length: 64, default: '' })
  workerId: string;

  @Column({ name: 'project_id', type: 'varchar', length: 64, default: '' })
  projectId: string;

  @Column({ name: 'work_order_id', type: 'varchar', length: 64, default: '' })
  workOrderId: string;

  @Column({ name: 'shift_id', type: 'varchar', length: 64, default: '' })
  shiftId: string;

  @Column({ type: 'varchar', length: 16, default: 'internal' })
  variant: TimesheetVariant;

  @Column({ name: 'source_submission_id', type: 'varchar', length: 64, nullable: true })
  sourceSubmissionId: string | null;

  @Column({ name: 'manually_edited', type: 'boolean', default: false })
  manuallyEdited: boolean;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'clock_in', type: 'varchar', length: 16, default: '' })
  clockIn: string;

  @Column({ name: 'clock_out', type: 'varchar', length: 16, default: '' })
  clockOut: string;

  @Column({ name: 'break_minutes', type: 'int', default: 0 })
  breakMinutes: number;

  @Column({
    name: 'regular_hours',
    type: 'numeric',
    precision: 8,
    scale: 2,
    default: 0,
  })
  regularHours: string;

  @Column({
    name: 'overtime_hours',
    type: 'numeric',
    precision: 8,
    scale: 2,
    default: 0,
  })
  overtimeHours: string;

  @Column({
    name: 'double_time_hours',
    type: 'numeric',
    precision: 8,
    scale: 2,
    default: 0,
  })
  doubleTimeHours: string;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ name: 'approved_by', type: 'varchar', length: 180, default: '' })
  approvedBy: string;

  @Column({ name: 'rejected_reason', type: 'text', default: '' })
  rejectedReason: string;

  @Column({ name: 'lunch_taken', type: 'boolean', default: false })
  lunchTaken: boolean;

  @Column({ name: 'employee_note', type: 'text', default: '' })
  employeeNote: string;

  @Column({ type: 'text', default: '' })
  signature: string;

  @Column({ type: 'text', default: '' })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
