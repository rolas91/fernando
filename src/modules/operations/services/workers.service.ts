import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Certification } from '../../../entities/certification.entity';
import { Worker } from '../../../entities/worker.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateWorkerDto } from '../dto/create-worker.dto';
import { UpdateWorkerDto } from '../dto/update-worker.dto';

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(Worker)
    private readonly workersRepo: Repository<Worker>,
    @InjectRepository(Certification)
    private readonly certificationsRepo: Repository<Certification>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.workersRepo.find({
      relations: { certifications: true },
      order: { firstName: 'ASC' },
    });
  }

  async findOne(id: string) {
    const worker = await this.workersRepo.findOne({
      where: { id },
      relations: { certifications: true },
    });
    if (!worker) throw new NotFoundException(`Worker ${id} not found`);
    return worker;
  }

  private async resolveCertifications(certificationIds?: string[]) {
    if (!certificationIds || certificationIds.length === 0) return [];
    return this.certificationsRepo.findBy(
      certificationIds.map((id) => ({ id })),
    );
  }

  async create(dto: CreateWorkerDto) {
    const certifications = await this.resolveCertifications(
      dto.certificationIds,
    );
    const entity = this.workersRepo.create({
      ...dto,
      certifications,
      hourlyRate:
        dto.hourlyRate !== undefined ? String(dto.hourlyRate) : undefined,
    });
    const saved = await this.workersRepo.save(entity);
    this.realtime.emitTableUpdated('workers');
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateWorkerDto) {
    const worker = await this.findOne(id);
    const certifications =
      dto.certificationIds !== undefined
        ? await this.resolveCertifications(dto.certificationIds)
        : worker.certifications;
    Object.assign(worker, {
      ...dto,
      certifications,
      hourlyRate:
        dto.hourlyRate !== undefined ? String(dto.hourlyRate) : undefined,
    });
    const saved = await this.workersRepo.save(worker);
    this.realtime.emitTableUpdated('workers');
    return this.findOne(saved.id);
  }

  async remove(id: string) {
    const worker = await this.findOne(id);
    await this.workersRepo.remove(worker);
    this.realtime.emitTableUpdated('workers');
    return { success: true };
  }
}
