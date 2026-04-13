import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('form_templates')
export class FormTemplate {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 120, default: 'Safety' })
  category: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  fields: Record<string, unknown>[];

  @Column({
    name: 'assigned_projects',
    type: 'text',
    array: true,
    default: '{}',
  })
  assignedProjects: string[];

  @Column({ name: 'assigned_roles', type: 'text', array: true, default: '{}' })
  assignedRoles: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
