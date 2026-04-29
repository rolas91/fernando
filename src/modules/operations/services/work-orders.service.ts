import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkOrder } from '../../../entities/work-order.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateWorkOrderDto } from '../dto/create-work-order.dto';
import { UpdateWorkOrderDto } from '../dto/update-work-order.dto';
import { normalizeWorkOrderShifts } from '../utils/work-order-shifts.util';
import { SpacesStorageService } from './spaces-storage.service';

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(
    @InjectRepository(WorkOrder)
    private readonly workOrdersRepo: Repository<WorkOrder>,
    private readonly realtime: RealtimeGateway,
    private readonly spacesStorage: SpacesStorageService,
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
      dispatchNote: dto.dispatchNote?.trim() || '',
      fileUploads: this.normalizeTextArray(dto.fileUploads),
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
    if (dto.dispatchNote !== undefined) {
      workOrder.dispatchNote = dto.dispatchNote.trim();
    }
    if (dto.fileUploads !== undefined) {
      workOrder.fileUploads = this.normalizeTextArray(dto.fileUploads);
    }
    const saved = await this.workOrdersRepo.save(workOrder);
    this.realtime.emitTableUpdated('work_orders');
    return saved;
  }

  async remove(id: string) {
    const workOrder = await this.findOne(id);
    try {
      await this.spacesStorage.deleteManyPublicFiles(workOrder.fileUploads || []);
    } catch (error) {
      this.logger.warn(
        `Could not delete stored files for work order ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await this.workOrdersRepo.remove(workOrder);
    this.realtime.emitTableUpdated('work_orders');
    return { success: true };
  }

  private normalizeTextArray(value: string[] | undefined) {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => {
        if (!entry || seen.has(entry)) return false;
        seen.add(entry);
        return true;
      });
  }
}
