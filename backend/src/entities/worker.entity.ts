import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  JoinColumn,
  ManyToMany,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Skill } from './skill.entity';
import { WorkerRole } from './worker-role.entity';
import { WorkerCertification } from './worker-certification.entity';
import { User } from './user.entity';

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

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @OneToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ type: 'varchar', length: 64, default: '' })
  phone: string;

  @Column({ name: 'driver_license', type: 'varchar', length: 120, default: '' })
  driverLicense: string;

  @Column({ name: 'driver_license_expiration', type: 'date', nullable: true })
  driverLicenseExpiration: string | null;

  @Column({ name: 'primary_address', type: 'text', default: '' })
  primaryAddress: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  city: string;

  @Column({ name: 'zip_code', type: 'varchar', length: 32, default: '' })
  zipCode: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  state: string;

  @Column({ type: 'varchar', length: 120, default: 'USA' })
  country: string;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ type: 'varchar', length: 100 })
  role: string;

  @Column({ type: 'varchar', length: 32 })
  status: string;

  @OneToMany(
    () => WorkerCertification,
    (workerCertification) => workerCertification.worker,
    {
      eager: false,
    },
  )
  workerCertifications: WorkerCertification[];

  @ManyToMany(() => Skill, (skill) => skill.workers, {
    eager: false,
  })
  @JoinTable({
    name: 'worker_skills',
    joinColumn: {
      name: 'worker_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'skill_id',
      referencedColumnName: 'id',
    },
  })
  skills: Skill[];

  @ManyToMany(() => WorkerRole, (workerRole) => workerRole.workers, {
    eager: false,
  })
  @JoinTable({
    name: 'worker_worker_roles',
    joinColumn: {
      name: 'worker_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'worker_role_id',
      referencedColumnName: 'id',
    },
  })
  workerRoles: WorkerRole[];

  @Column({ name: 'file_uploads', type: 'text', array: true, default: '{}' })
  fileUploads: string[];

  @Column({ name: 'fcm_tokens', type: 'text', array: true, default: '{}' })
  fcmTokens: string[];

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
