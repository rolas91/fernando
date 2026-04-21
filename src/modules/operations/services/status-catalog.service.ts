import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StatusCatalog } from '../../../entities/status-catalog.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateStatusCatalogDto } from '../dto/create-status-catalog.dto';
import { UpdateStatusCatalogDto } from '../dto/update-status-catalog.dto';

@Injectable()
export class StatusCatalogService {
  constructor(
    @InjectRepository(StatusCatalog)
    private readonly repo: Repository<StatusCatalog>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.repo.find({ order: { scope: 'ASC', sortOrder: 'ASC', name: 'ASC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Status ${id} not found`);
    return item;
  }

  create(dto: CreateStatusCatalogDto) {
    return this.repo.save(this.repo.create(dto)).then((saved) => {
      this.realtime.emitTableUpdated('status_catalog');
      return saved;
    });
  }

  async update(id: string, dto: UpdateStatusCatalogDto) {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('status_catalog');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('status_catalog');
    return { success: true };
  }
}
