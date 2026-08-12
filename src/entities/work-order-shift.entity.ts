import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkOrder } from './work-order.entity';
import { WorkOrderShiftRole } from './work-order-shift-role.entity';
import { User } from './user.entity';

@Entity('work_order_shifts')
@Index('idx_work_order_shifts_work_order', ['workOrderId'])
export class WorkOrderShift {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ name: 'work_order_id', type: 'varchar', length: 64 })
  workOrderId: string;

  @Column({ name: 'shift_name', type: 'varchar', length: 180 })
  shiftName: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder: number;

  @Column({ name: 'start_time', type: 'varchar', length: 16, default: '' })
  startTime: string;

  @Column({ name: 'end_time', type: 'varchar', length: 16, default: '' })
  endTime: string;

  @Column({ type: 'varchar', length: 64, nullable: true, default: null })
  status: string | null;

  @Column({
    name: 'confirmation_reset_reason',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  confirmationResetReason: string | null;

  /**
   * Manual cancellation flag. When true, the shift computes to the automatic
   * `shift_cancelled` status regardless of `status` or confirmations.
   */
  @Column({ type: 'boolean', default: false })
  cancelled: boolean;

  @Column({ name: 'pm_approved_at', type: 'timestamp', nullable: true })
  pmApprovedAt: Date | null;

  @Column({ name: 'pm_approved_by_user_id', type: 'uuid', nullable: true })
  pmApprovedByUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'pm_approved_by_user_id' })
  pmApprovedByUser?: User | null;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser?: User | null;

  @Column({ name: 'requester_user_id', type: 'uuid', nullable: true })
  requesterUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requester_user_id' })
  requesterUser?: User | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'cross_street_location_detail', type: 'text', nullable: true })
  crossStreetLocationDetail: string | null;

  @Column({ name: 'address_latitude', type: 'double precision', nullable: true })
  addressLatitude: number | null;
  @Column({ name: 'address_longitude', type: 'double precision', nullable: true })
  addressLongitude: number | null;
  @Column({ name: 'address_city', type: 'varchar', length: 120, nullable: true })
  addressCity: string | null;
  @Column({ name: 'address_state', type: 'varchar', length: 120, nullable: true })
  addressState: string | null;
  @Column({ name: 'address_zip_code', type: 'varchar', length: 32, nullable: true })
  addressZipCode: string | null;
  @Column({ name: 'address_country', type: 'varchar', length: 120, nullable: true })
  addressCountry: string | null;

  @Column({ name: 'requester_name', type: 'varchar', length: 200, nullable: true })
  requesterName: string | null;

  @Column({ name: 'requester_phone', type: 'varchar', length: 64, nullable: true })
  requesterPhone: string | null;

  @Column({ name: 'requester_email', type: 'varchar', length: 255, nullable: true })
  requesterEmail: string | null;

  @Column({ name: 'visible_document_types', type: 'jsonb', default: () => "'[]'::jsonb" })
  visibleDocumentTypes: string[];

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'client_timesheet_notes', type: 'text', default: '' })
  clientTimesheetNotes: string;

  @Column({ name: 'internal_timesheet_notes', type: 'text', default: '' })
  internalTimesheetNotes: string;

  @Column({ name: 'planned_equipment', type: 'jsonb', default: () => "'[]'::jsonb" })
  plannedEquipment: Array<{ type: string; estimatedQuantity: number }>;

  @Column({ name: 'planned_materials', type: 'jsonb', default: () => "'[]'::jsonb" })
  plannedMaterials: Array<{ type: string; estimatedQuantity: number; materialIds?: string[] }>;

  @Column({ name: 'work_order_types', type: 'jsonb', default: () => "'[]'::jsonb" })
  workOrderTypes: string[];

  @Column({
    name: 'work_order_authorized_worker_ids',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  workOrderAuthorizedWorkerIds: string[];

  @Column({
    name: 'default_role_start_time',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  defaultRoleStartTime: string | null;

  @Column({
    name: 'shift_template_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  shiftTemplateId: string | null;

  @ManyToOne(() => WorkOrder, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'work_order_id' })
  workOrder?: WorkOrder;

  @OneToMany(() => WorkOrderShiftRole, (role) => role.shift, { cascade: true })
  roles?: WorkOrderShiftRole[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
