import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('activity_feed')
export class ActivityFeedItem {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', default: '' })
  subtitle: string;

  @Column({ type: 'varchar', length: 180, default: '' })
  user: string;

  @Column({ type: 'timestamp', nullable: true })
  timestamp: Date | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tags: Record<string, unknown>[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
