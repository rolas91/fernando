import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkOrder } from '../../../entities/work-order.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateWorkOrderDto } from '../dto/create-work-order.dto';
import { UpdateWorkOrderDto } from '../dto/update-work-order.dto';
import { normalizeWorkOrderShifts } from '../utils/work-order-shifts.util';

@Injectable()
export class WorkOrdersService {
  constructor(
    @InjectRepository(WorkOrder)
    private readonly workOrdersRepo: Repository<WorkOrder>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.workOrdersRepo.find({ order: { startDate: 'ASC' } });
  }

  async findOne(id: string) {
    const workOrder = await this.workOrdersRepo.findOne({ where: { id } });
    if (!workOrder) throw new NotFoundException(`Work order ${id} not found`);
    return workOrder;
  }

  create(dto: CreateWorkOrderDto) {
    const entity = this.workOrdersRepo.create({
      ...dto,
      shifts: normalizeWorkOrderShifts(dto.shifts),
    });
    return this.workOrdersRepo.save(entity).then((saved) => {
      this.realtime.emitTableUpdated('work_orders');
      return saved;
    });
  }

  async update(id: string, dto: UpdateWorkOrderDto) {
    const workOrder = await this.findOne(id);
    Object.assign(workOrder, dto);
    if (dto.shifts !== undefined) {
      workOrder.shifts = normalizeWorkOrderShifts(dto.shifts, workOrder.shifts);
    }
    const saved = await this.workOrdersRepo.save(workOrder);
    this.realtime.emitTableUpdated('work_orders');
    return saved;
  }

  async remove(id: string) {
    const workOrder = await this.findOne(id);
    await this.workOrdersRepo.remove(workOrder);
    this.realtime.emitTableUpdated('work_orders');
    return { success: true };
  }
}
