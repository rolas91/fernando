import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('equipment')
export class Equipment {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'varchar', length: 120 })
  type: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  identifier: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  brand: string;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @Column({ name: 'last_maintenance', type: 'date', nullable: true })
  lastMaintenance: string | null;

  @Column({ name: 'next_maintenance', type: 'date', nullable: true })
  nextMaintenance: string | null;

  @Column({ type: 'text', default: '' })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
