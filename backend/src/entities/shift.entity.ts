import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('shifts')
export class Shift {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'varchar', length: 40, default: 'standard' })
  type: string;

  @Column({ name: 'start_time', type: 'varchar', length: 5, nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'varchar', length: 5, nullable: true })
  endTime: string | null;

  @Column({ name: 'duration_hours', type: 'double precision', nullable: true })
  durationHours: number | null;

  @Column({ type: 'varchar', length: 24, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
