import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkerRole } from '../../../entities/worker-role.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateWorkerRoleDto } from '../dto/create-worker-role.dto';
import { UpdateWorkerRoleDto } from '../dto/update-worker-role.dto';

@Injectable()
export class WorkerRolesService {
  constructor(
    @InjectRepository(WorkerRole)
    private readonly repo: Repository<WorkerRole>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Worker role ${id} not found`);
    return item;
  }

  create(dto: CreateWorkerRoleDto) {
    return this.repo.save(this.repo.create(dto)).then((saved) => {
      this.realtime.emitTableUpdated('worker_roles');
      this.realtime.emitTableUpdated('workers');
      return saved;
    });
  }

  async update(id: string, dto: UpdateWorkerRoleDto) {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('worker_roles');
    this.realtime.emitTableUpdated('workers');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('worker_roles');
    this.realtime.emitTableUpdated('workers');
    return { success: true };
  }
}
