import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('system_errors')
export class SystemError {
  @PrimaryColumn('uuid') id: string;
  @Index({ unique: true }) @Column() fingerprint: string;
  @Column() source: string;
  @Column() level: string;
  @Column('text') message: string;
  @Column('text') stack: string;
  @Column() context: string;
  @Column() path: string;
  @Column() method: string;
  @Column({ nullable: true }) statusCode: number;
  @Column() userId: string;
  @Column() requestId: string;
  @Column({ default: 'pending' }) status: string;
  @Column({ default: 1 }) occurrences: number;
  @Index() @Column('timestamptz') firstSeen: Date;
  @Index() @Column('timestamptz') lastSeen: Date;
  @Column({ nullable: true, type: 'timestamptz' }) resolvedAt: Date | null;
  @Column({ default: '' }) resolvedBy: string;
}
