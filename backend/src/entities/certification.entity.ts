import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkerCertification } from './worker-certification.entity';

@Entity('certifications')
export class Certification {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 180 })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 24, default: 'active' })
  status: string;

  @Column({ name: 'document_url', type: 'text', nullable: true })
  documentUrl: string | null;

  @OneToMany(
    () => WorkerCertification,
    (workerCertification) => workerCertification.certification,
  )
  workerCertifications: WorkerCertification[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
