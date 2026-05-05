import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Certification } from './certification.entity';
import { Worker } from './worker.entity';

@Entity('worker_certifications')
export class WorkerCertification {
  @PrimaryColumn({ name: 'worker_id', type: 'varchar', length: 64 })
  workerId: string;

  @PrimaryColumn({ name: 'certification_id', type: 'varchar', length: 64 })
  certificationId: string;

  @Column({ name: 'expiration_date', type: 'date', nullable: true })
  expirationDate: string | null;

  @ManyToOne(() => Worker, (worker) => worker.workerCertifications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'worker_id' })
  worker: Worker;

  @ManyToOne(
    () => Certification,
    (certification) => certification.workerCertifications,
    {
      eager: true,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'certification_id' })
  certification: Certification;
}
