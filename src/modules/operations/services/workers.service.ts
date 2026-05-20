import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Certification } from '../../../entities/certification.entity';
import { Skill } from '../../../entities/skill.entity';
import { Worker } from '../../../entities/worker.entity';
import { WorkerCertification } from '../../../entities/worker-certification.entity';
import { WorkerRole } from '../../../entities/worker-role.entity';
import { AccessService } from '../../access/services/access.service';
import { PasswordHasherService } from '../../auth/services/password-hasher.service';
import { UsersService } from '../../users/services/users.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import {
  CreateWorkerDto,
  WorkerCertificationAssignmentDto,
} from '../dto/create-worker.dto';
import { UpdateWorkerDto } from '../dto/update-worker.dto';
import { SpacesStorageService } from './spaces-storage.service';
import type { UserAccessContext } from '../../access/ports/access.port';

type LinkedAppRole = 'admin' | 'manager' | 'scheduler' | 'viewer';

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(Worker)
    private readonly workersRepo: Repository<Worker>,
    @InjectRepository(Certification)
    private readonly certificationsRepo: Repository<Certification>,
    @InjectRepository(Skill)
    private readonly skillsRepo: Repository<Skill>,
    @InjectRepository(WorkerRole)
    private readonly workerRolesRepo: Repository<WorkerRole>,
    @InjectRepository(WorkerCertification)
    private readonly workerCertificationsRepo: Repository<WorkerCertification>,
    private readonly realtime: RealtimeGateway,
    private readonly spacesStorage: SpacesStorageService,
    private readonly usersService: UsersService,
    private readonly accessService: AccessService,
    private readonly passwordHasher: PasswordHasherService,
  ) {}

  async findAll() {
    const workers = await this.workersRepo.find({
      relations: {
        workerCertifications: { certification: true },
        skills: true,
        workerRoles: true,
      },
      order: { firstName: 'ASC' },
    });
    return workers.map((worker) => this.serializeWorker(worker));
  }

  async findOne(id: string) {
    const worker = await this.workersRepo.findOne({
      where: { id },
      relations: {
        workerCertifications: { certification: true },
        skills: true,
        workerRoles: true,
      },
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
      workerRoleIds: (worker.workerRoles || []).map((role) => role.id),
    };
  }

  private finalizeWorkerPostalFields(worker: Worker) {
    worker.country = (worker.country ?? '').trim() || 'USA';
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

  private normalizeWorkerRoleIds(
    dto: Pick<CreateWorkerDto, 'workerRoleIds' | 'workerRoles'>,
  ) {
    const rawIds = dto.workerRoleIds || dto.workerRoles;
    if (rawIds === undefined) return undefined;
    return rawIds.reduce<string[]>((acc, roleId) => {
      if (!roleId || acc.includes(roleId)) return acc;
      acc.push(roleId);
      return acc;
    }, []);
  }

  private async resolveSkills(skillIds: string[]) {
    if (skillIds.length === 0) return [];
    return this.skillsRepo.findBy(skillIds.map((id) => ({ id })));
  }

  private async resolveWorkerRoles(workerRoleIds: string[]) {
    if (workerRoleIds.length === 0) return [];
    return this.workerRolesRepo.findBy(workerRoleIds.map((id) => ({ id })));
  }

  private ensureUsersWrite(actor: UserAccessContext | undefined) {
    if (actor?.permissions.includes('users.write')) return;
    throw new ForbiddenException(
      'Only administrators can link workers to platform users (requires users.write).',
    );
  }

  /** Create auth user matching worker contact fields; callers must rollback worker on thrown errors. */
  private async provisionLinkedAppUser(payload: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    password: string;
    role: LinkedAppRole;
  }): Promise<void> {
    const passwordHash = await this.passwordHasher.hash(payload.password);
    const user = await this.usersService.create({
      email: payload.email.trim().toLowerCase(),
      passwordHash,
      firstName: payload.firstName.trim(),
      lastName: payload.lastName.trim(),
      phone: (payload.phone || '').trim(),
      status: 'active',
      lastLogin: null,
    });
    try {
      await this.accessService.replaceAppRoleForUser(user.id, payload.role);
    } catch (roleErr) {
      await this.usersService.delete(user.id);
      throw roleErr;
    }
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

  async create(
    dto: CreateWorkerDto,
    actor: UserAccessContext | undefined,
  ) {
    if (dto.createAppUser === true) {
      this.ensureUsersWrite(actor);
    }

    const certificationAssignments = this.normalizeCertificationAssignments(dto);
    const skillIds = this.normalizeSkillIds(dto);
    const workerRoleIds = this.normalizeWorkerRoleIds(dto);
    const {
      certificationIds: _certificationIds,
      certificationAssignments: _certificationAssignments,
      skillIds: _skillIds,
      skills: _skills,
      workerRoleIds: _workerRoleIds,
      workerRoles: _workerRoles,
      createAppUser,
      appUserPassword,
      appUserRole,
      hourlyRate,
      ...rest
    } = dto;
    const skills =
      skillIds !== undefined ? await this.resolveSkills(skillIds) : [];
    const workerRoles =
      workerRoleIds !== undefined
        ? await this.resolveWorkerRoles(workerRoleIds)
        : [];
    const entity = this.workersRepo.create({
      ...rest,
      skills,
      workerRoles,
      hourlyRate:
        hourlyRate !== undefined ? String(hourlyRate) : undefined,
    });
    this.finalizeWorkerPostalFields(entity);
    const saved = await this.workersRepo.save(entity);
    if (certificationAssignments !== undefined) {
      await this.replaceWorkerCertifications(saved.id, certificationAssignments);
    }

    if (
      createAppUser === true &&
      appUserPassword &&
      appUserRole
    ) {
      try {
        await this.provisionLinkedAppUser({
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          password: appUserPassword,
          role: appUserRole,
        });
      } catch (err) {
        await this.workersRepo.delete(saved.id);
        throw err;
      }
    }

    this.realtime.emitTableUpdated('workers');
    return this.findOne(saved.id);
  }

  async update(
    id: string,
    dto: UpdateWorkerDto,
    actor: UserAccessContext | undefined,
  ) {
    const worker = await this.workersRepo.findOne({
      where: { id },
      relations: { skills: true, workerRoles: true },
    });
    if (!worker) throw new NotFoundException(`Worker ${id} not found`);

    if (dto.createAppUser === true) {
      this.ensureUsersWrite(actor);
    }

    const certificationAssignments = this.normalizeCertificationAssignments(dto);
    const skillIds = this.normalizeSkillIds(dto);
    const workerRoleIds = this.normalizeWorkerRoleIds(dto);
    const {
      certificationIds: _certificationIds,
      certificationAssignments: _certificationAssignments,
      skillIds: _skillIds,
      skills: _skills,
      workerRoleIds: _workerRoleIds,
      workerRoles: _workerRoles,
      createAppUser,
      appUserPassword,
      appUserRole,
      hourlyRate,
      ...rest
    } = dto;
    const skills =
      skillIds !== undefined
        ? await this.resolveSkills(skillIds)
        : worker.skills || [];
    const workerRoles =
      workerRoleIds !== undefined
        ? await this.resolveWorkerRoles(workerRoleIds)
        : worker.workerRoles || [];
    Object.assign(worker, {
      ...rest,
      skills,
      workerRoles,
      hourlyRate:
        hourlyRate !== undefined ? String(hourlyRate) : worker.hourlyRate,
    });
    this.finalizeWorkerPostalFields(worker);
    const saved = await this.workersRepo.save(worker);
    if (certificationAssignments !== undefined) {
      await this.replaceWorkerCertifications(saved.id, certificationAssignments);
    }

    if (
      createAppUser === true &&
      appUserPassword &&
      appUserRole
    ) {
      await this.provisionLinkedAppUser({
        email: saved.email || '',
        firstName: saved.firstName || '',
        lastName: saved.lastName || '',
        phone: saved.phone || '',
        password: appUserPassword,
        role: appUserRole,
      });
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
