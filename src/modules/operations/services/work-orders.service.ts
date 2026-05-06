import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../../../entities/project.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateWorkOrderDto } from '../dto/create-work-order.dto';
import { UpdateWorkOrderDto } from '../dto/update-work-order.dto';
import {
  assertAssignmentWithinProjectDates,
  assertShiftsWithinAssignmentDateRange,
} from '../utils/work-order-shift-date-range.util';
import { normalizeWorkOrderShifts } from '../utils/work-order-shifts.util';
import { SpacesStorageService } from './spaces-storage.service';

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(
    @InjectRepository(WorkOrder)
    private readonly workOrdersRepo: Repository<WorkOrder>,
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>,
    private readonly realtime: RealtimeGateway,
    private readonly spacesStorage: SpacesStorageService,
  ) {}

  findAll() {
    return this.workOrdersRepo.find({ order: { startDate: 'ASC' } });
  }

  async findOne(id: string) {
    const workOrder = await this.workOrdersRepo.findOne({ where: { id } });
    if (!workOrder) throw new NotFoundException(`Assignment ${id} not found`);
    return workOrder;
  }

  async create(dto: CreateWorkOrderDto) {
    await this.applyProjectAssignmentDateBounds(dto.projectId, dto.startDate, dto.endDate);

    const shifts = normalizeWorkOrderShifts(dto.shifts);
    assertShiftsWithinAssignmentDateRange(dto.startDate, dto.endDate, shifts);
    const entity = this.workOrdersRepo.create({
      ...dto,
      shifts,
      dispatchNote: dto.dispatchNote?.trim() || '',
      fileUploads: this.normalizeTextArray(dto.fileUploads),
    });
    if (dto.assignmentAddress !== undefined) {
      entity.assignmentAddress = (dto.assignmentAddress ?? '').trim();
    }
    if (dto.assignmentCity !== undefined) {
      entity.assignmentCity = (dto.assignmentCity ?? '').trim();
    }
    if (dto.assignmentState !== undefined) {
      entity.assignmentState = (dto.assignmentState ?? '').trim();
    }
    if (dto.assignmentZipCode !== undefined) {
      entity.assignmentZipCode = (dto.assignmentZipCode ?? '').trim();
    }
    if (dto.assignmentCountry !== undefined) {
      entity.assignmentCountry =
        (dto.assignmentCountry ?? '').trim() || 'USA';
    }
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
    assertShiftsWithinAssignmentDateRange(
      workOrder.startDate,
      workOrder.endDate,
      workOrder.shifts as Record<string, unknown>[],
    );

    await this.applyProjectAssignmentDateBounds(
      workOrder.projectId,
      workOrder.startDate,
      workOrder.endDate,
    );

    if (dto.dispatchNote !== undefined) {
      workOrder.dispatchNote = dto.dispatchNote.trim();
    }
    if (dto.fileUploads !== undefined) {
      workOrder.fileUploads = this.normalizeTextArray(dto.fileUploads);
    }
    if (dto.assignmentAddress !== undefined) {
      workOrder.assignmentAddress = (dto.assignmentAddress ?? '').trim();
    }
    if (dto.assignmentCity !== undefined) {
      workOrder.assignmentCity = (dto.assignmentCity ?? '').trim();
    }
    if (dto.assignmentState !== undefined) {
      workOrder.assignmentState = (dto.assignmentState ?? '').trim();
    }
    if (dto.assignmentZipCode !== undefined) {
      workOrder.assignmentZipCode = (dto.assignmentZipCode ?? '').trim();
    }
    if (dto.assignmentCountry !== undefined) {
      workOrder.assignmentCountry =
        (dto.assignmentCountry ?? '').trim() || 'USA';
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
        `Could not delete stored files for assignment ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await this.workOrdersRepo.remove(workOrder);
    this.realtime.emitTableUpdated('work_orders');
    return { success: true };
  }

  private async applyProjectAssignmentDateBounds(
    projectId: string | undefined,
    woStart: unknown,
    woEnd: unknown,
  ): Promise<void> {
    const pid = typeof projectId === 'string' ? projectId.trim() : '';
    if (!pid) return;

    const project = await this.projectsRepo.findOne({ where: { id: pid } });
    if (!project) throw new NotFoundException(`Project ${pid} not found`);

    assertAssignmentWithinProjectDates(
      project.startDate,
      project.endDate,
      woStart,
      woEnd,
    );
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
