import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type StatusCatalogScope =
  | 'work_order'
  | 'work_status'
  | 'shift'
  | 'timesheet'
  | 'project'
  | 'equipment'
  | 'availability_request'
  | 'incident'
  | 'form_submission';

@Entity('status_catalog')
export class StatusCatalog {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 32 })
  scope: StatusCatalogScope;

  @Column({ type: 'varchar', length: 64 })
  value: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'varchar', length: 16, default: '#94A3B8' })
  color: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'blocks_editing', type: 'boolean', default: false })
  blocksEditing: boolean;

  @Column({ name: 'triggers_notification', type: 'boolean', default: false })
  triggersNotification: boolean;

  @Column({ name: 'requires_approval', type: 'boolean', default: false })
  requiresApproval: boolean;

  /**
   * True when the status is derived from data (confirmations, form
   * submissions, cancellation flow) and cannot be set manually by the user.
   */
  @Column({ type: 'boolean', default: false })
  automatic: boolean;

  @Column({ type: 'varchar', length: 24, default: 'active' })
  status: 'active' | 'inactive';

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
