import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Certification } from '../../../entities/certification.entity';
import { Skill } from '../../../entities/skill.entity';
import { Worker } from '../../../entities/worker.entity';
import { WorkerCertification } from '../../../entities/worker-certification.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import {
  CreateWorkerDto,
  WorkerCertificationAssignmentDto,
} from '../dto/create-worker.dto';
import { UpdateWorkerDto } from '../dto/update-worker.dto';
import { SpacesStorageService } from './spaces-storage.service';

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(Worker)
    private readonly workersRepo: Repository<Worker>,
    @InjectRepository(Certification)
    private readonly certificationsRepo: Repository<Certification>,
    @InjectRepository(Skill)
    private readonly skillsRepo: Repository<Skill>,
    @InjectRepository(WorkerCertification)
    private readonly workerCertificationsRepo: Repository<WorkerCertification>,
    private readonly realtime: RealtimeGateway,
    private readonly spacesStorage: SpacesStorageService,
  ) {}

  async findAll() {
    const workers = await this.workersRepo.find({
      relations: { workerCertifications: { certification: true }, skills: true },
      order: { firstName: 'ASC' },
    });
    return workers.map((worker) => this.serializeWorker(worker));
  }

  async findOne(id: string) {
    const worker = await this.workersRepo.findOne({
      where: { id },
      relations: { workerCertifications: { certification: true }, skills: true },
    });
    if (!worker) throw new NotFoundException(`Worker ${id} not found`);
    return this.serializeWorker(worker);
  }

  private serializeWorker(worker: Worker) {
    const {
      workerCertifications,
      ...rest
    } = worker as Worker & { workerCertifications?: WorkerCertification[] };
    const assignments = (workerCertifications || []).map(
      (workerCertification) => ({
        certificationId: workerCertification.certificationId,
        expirationDate: workerCertification.expirationDate || undefined,
      }),
    );

    return {
      ...rest,
      certifications: (workerCertifications || []).map((workerCertification) => ({
        ...workerCertification.certification,
        expirationDate: workerCertification.expirationDate || undefined,
      })),
      certificationAssignments: assignments,
      skillIds: (worker.skills || []).map((skill) => skill.id),
    };
  }

  private normalizeCertificationAssignments(
    dto: Pick<CreateWorkerDto, 'certificationIds' | 'certificationAssignments'>,
  ) {
    if (dto.certificationAssignments !== undefined) {
      return dto.certificationAssignments
        .filter((assignment) => assignment?.certificationId)
        .reduce<WorkerCertificationAssignmentDto[]>((acc, assignment) => {
          if (acc.some((item) => item.certificationId === assignment.certificationId)) {
            return acc;
          }
          acc.push({
            certificationId: assignment.certificationId,
            expirationDate: assignment.expirationDate || undefined,
          });
          return acc;
        }, []);
    }

    if (dto.certificationIds !== undefined) {
      return dto.certificationIds.reduce<WorkerCertificationAssignmentDto[]>(
        (acc, certificationId) => {
          if (!certificationId || acc.some((item) => item.certificationId === certificationId)) {
            return acc;
          }
          acc.push({ certificationId });
          return acc;
        },
        [],
      );
    }

    return undefined;
  }

  private normalizeSkillIds(
    dto: Pick<CreateWorkerDto, 'skillIds' | 'skills'>,
  ) {
    const rawIds = dto.skillIds || dto.skills;
    if (rawIds === undefined) return undefined;
    return rawIds.reduce<string[]>((acc, skillId) => {
      if (!skillId || acc.includes(skillId)) return acc;
      acc.push(skillId);
      return acc;
    }, []);
  }

  private async resolveSkills(skillIds: string[]) {
    if (skillIds.length === 0) return [];
    return this.skillsRepo.findBy(skillIds.map((id) => ({ id })));
  }

  private async replaceWorkerCertifications(
    workerId: string,
    assignments: WorkerCertificationAssignmentDto[],
  ) {
    await this.workerCertificationsRepo.delete({ workerId });

    if (assignments.length === 0) return;

    const certifications = await this.certificationsRepo.findBy(
      assignments.map((assignment) => ({ id: assignment.certificationId })),
    );
    const knownCertificationIds = new Set(
      certifications.map((certification) => certification.id),
    );

    const records = assignments
      .filter((assignment) => knownCertificationIds.has(assignment.certificationId))
      .map((assignment) =>
        this.workerCertificationsRepo.create({
          workerId,
          certificationId: assignment.certificationId,
          expirationDate: assignment.expirationDate || null,
        }),
      );

    if (records.length > 0) {
      await this.workerCertificationsRepo.save(records);
    }
  }

  async create(dto: CreateWorkerDto) {
    const certificationAssignments = this.normalizeCertificationAssignments(dto);
    const skillIds = this.normalizeSkillIds(dto);
    const {
      certificationIds: _certificationIds,
      certificationAssignments: _certificationAssignments,
      skillIds: _skillIds,
      skills: _skills,
      hourlyRate,
      ...rest
    } = dto;
    const skills =
      skillIds !== undefined ? await this.resolveSkills(skillIds) : [];
    const entity = this.workersRepo.create({
      ...rest,
      skills,
      hourlyRate:
        hourlyRate !== undefined ? String(hourlyRate) : undefined,
    });
    const saved = await this.workersRepo.save(entity);
    if (certificationAssignments !== undefined) {
      await this.replaceWorkerCertifications(saved.id, certificationAssignments);
    }
    this.realtime.emitTableUpdated('workers');
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateWorkerDto) {
    const worker = await this.workersRepo.findOne({
      where: { id },
      relations: { skills: true },
    });
    if (!worker) throw new NotFoundException(`Worker ${id} not found`);

    const certificationAssignments = this.normalizeCertificationAssignments(dto);
    const skillIds = this.normalizeSkillIds(dto);
    const {
      certificationIds: _certificationIds,
      certificationAssignments: _certificationAssignments,
      skillIds: _skillIds,
      skills: _skills,
      hourlyRate,
      ...rest
    } = dto;
    const skills =
      skillIds !== undefined
        ? await this.resolveSkills(skillIds)
        : worker.skills || [];
    Object.assign(worker, {
      ...rest,
      skills,
      hourlyRate:
        hourlyRate !== undefined ? String(hourlyRate) : worker.hourlyRate,
    });
    const saved = await this.workersRepo.save(worker);
    if (certificationAssignments !== undefined) {
      await this.replaceWorkerCertifications(saved.id, certificationAssignments);
    }
    this.realtime.emitTableUpdated('workers');
    return this.findOne(saved.id);
  }

  async remove(id: string) {
    const worker = await this.workersRepo.findOne({ where: { id } });
    if (!worker) throw new NotFoundException(`Worker ${id} not found`);
    await this.spacesStorage.deleteManyPublicFiles(worker.fileUploads || []);
    await this.workersRepo.remove(worker);
    this.realtime.emitTableUpdated('workers');
    return { success: true };
  }
}
