import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkOrderType } from '../../../entities/work-order-type.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateWorkOrderTypeDto } from '../dto/create-work-order-type.dto';
import { UpdateWorkOrderTypeDto } from '../dto/update-work-order-type.dto';

@Injectable()
export class WorkOrderTypesService {
  constructor(
    @InjectRepository(WorkOrderType)
    private readonly repo: Repository<WorkOrderType>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Work order type ${id} not found`);
    return item;
  }

  create(dto: CreateWorkOrderTypeDto) {
    return this.repo.save(this.repo.create(dto)).then((saved) => {
      this.realtime.emitTableUpdated('work_order_types');
      return saved;
    });
  }

  async update(id: string, dto: UpdateWorkOrderTypeDto) {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('work_order_types');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('work_order_types');
    return { success: true };
  }
}
