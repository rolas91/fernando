import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Certification } from './certification.entity';

@Entity('workers')
export class Worker {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ name: 'first_name', type: 'varchar', length: 120 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 120 })
  lastName: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  email: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  phone: string;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ type: 'varchar', length: 100 })
  role: string;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @ManyToMany(() => Certification, (certification) => certification.workers, {
    eager: false,
  })
  @JoinTable({
    name: 'worker_certifications',
    joinColumn: {
      name: 'worker_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'certification_id',
      referencedColumnName: 'id',
    },
  })
  certifications: Certification[];

  @Column({ type: 'text', array: true, default: '{}' })
  skills: string[];

  @Column({ name: 'hire_date', type: 'date', nullable: true })
  hireDate: string | null;

  @Column({
    name: 'hourly_rate',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
  })
  hourlyRate: string;

  @Column({ type: 'text', nullable: true })
  avatar: string | null;

  @Column({ name: 'emergency_contact', type: 'text', nullable: true })
  emergencyContact: string | null;

  @Column({ type: 'text', default: '' })
  notes: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
