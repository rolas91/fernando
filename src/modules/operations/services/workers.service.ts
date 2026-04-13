import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker } from '../../../entities/worker.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateWorkerDto } from '../dto/create-worker.dto';
import { UpdateWorkerDto } from '../dto/update-worker.dto';

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(Worker)
    private readonly workersRepo: Repository<Worker>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.workersRepo.find({ order: { firstName: 'ASC' } });
  }

  async findOne(id: string) {
    const worker = await this.workersRepo.findOne({ where: { id } });
    if (!worker) throw new NotFoundException(`Worker ${id} not found`);
    return worker;
  }

  create(dto: CreateWorkerDto) {
    const entity = this.workersRepo.create({
      ...dto,
      hourlyRate:
        dto.hourlyRate !== undefined ? String(dto.hourlyRate) : undefined,
    });
    return this.workersRepo.save(entity).then((saved) => {
      this.realtime.emitTableUpdated('workers');
      return saved;
    });
  }

  async update(id: string, dto: UpdateWorkerDto) {
    const worker = await this.findOne(id);
    Object.assign(worker, {
      ...dto,
      hourlyRate:
        dto.hourlyRate !== undefined ? String(dto.hourlyRate) : undefined,
    });
    const saved = await this.workersRepo.save(worker);
    this.realtime.emitTableUpdated('workers');
    return saved;
  }

  async remove(id: string) {
    const worker = await this.findOne(id);
    await this.workersRepo.remove(worker);
    this.realtime.emitTableUpdated('workers');
    return { success: true };
  }
}
