import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanySettings } from '../../../entities/company-settings.entity';
import { Equipment } from '../../../entities/equipment.entity';
import { Project } from '../../../entities/project.entity';
import { Worker } from '../../../entities/worker.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateWorkOrderDto } from '../dto/create-work-order.dto';
import { UpdateWorkOrderDto } from '../dto/update-work-order.dto';
import {
  computeAssignmentStatus,
  parseAssignmentAutoStatusRules,
  type ComputeAssignmentStatusInput,
} from '../utils/assignment-auto-status.util';
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
    @InjectRepository(Equipment)
    private readonly equipmentRepo: Repository<Equipment>,
    @InjectRepository(Worker)
    private readonly workerRepo: Repository<Worker>,
    @InjectRepository(CompanySettings)
    private readonly companySettingsRepo: Repository<CompanySettings>,
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
    const { status: dtoStatusLane, ...dtoWithoutDeclaredStatus } = dto;
    const entity = this.workOrdersRepo.create({
      ...dtoWithoutDeclaredStatus,
      status: 'pending',
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

    await this.applyAutoAssignmentStatus(entity, undefined, dtoStatusLane);

    return this.workOrdersRepo.save(entity).then((saved) => {
      this.realtime.emitTableUpdated('work_orders');
      return saved;
    });
  }

  async update(id: string, dto: UpdateWorkOrderDto) {
    const workOrder = await this.findOne(id);
    const previousStatus = workOrder.status;
    const { status: dtoStatusLane, ...dtoRest } = dto;
    Object.assign(workOrder, dtoRest);
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

    await this.applyAutoAssignmentStatus(
      workOrder,
      previousStatus,
      dtoStatusLane,
    );

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

  private buildSchedulingSnapshot(
    current: WorkOrder,
    allRows: WorkOrder[],
  ): ComputeAssignmentStatusInput['allWorkOrdersForScheduling'] {
    const hasCurrent = allRows.some((w) => w.id === current.id);
    const base = hasCurrent ? allRows : [...allRows, current];
    return base.map((w) =>
      w.id === current.id
        ? {
            id: current.id,
            status: current.status,
            shifts: current.shifts as Record<string, unknown>[],
          }
        : {
            id: w.id,
            status: w.status,
            shifts: w.shifts as Record<string, unknown>[],
          },
    );
  }

  private async applyAutoAssignmentStatus(
    entity: WorkOrder,
    previousStatus: string | undefined,
    dtoStatusLane: string | undefined,
  ) {
    try {
      const [allRows, equipmentRows, workerRows, settingsRow] =
        await Promise.all([
          this.workOrdersRepo.find(),
          this.equipmentRepo.find(),
          this.workerRepo.find({
            relations: { workerCertifications: true },
          }),
          this.companySettingsRepo.find({
            order: { updatedAt: 'DESC' },
            take: 1,
          }),
        ]);

      const rules = parseAssignmentAutoStatusRules(
        settingsRow[0]?.assignmentAutoStatus ?? null,
      );
      const equipmentStatusById = new Map(
        equipmentRows.map((e) => [e.id, e.status]),
      );
      const workerCertExpiryDates = new Map<
        string,
        (string | null | undefined)[]
      >();
      for (const w of workerRows) {
        workerCertExpiryDates.set(
          w.id,
          (w.workerCertifications ?? []).map((wc) => wc.expirationDate),
        );
      }

      const allForScheduling = this.buildSchedulingSnapshot(entity, allRows);

      const { status } = computeAssignmentStatus({
        workOrderId: entity.id,
        previousStatus,
        dtoStatus: dtoStatusLane,
        startDate: entity.startDate,
        endDate: entity.endDate,
        shifts: entity.shifts as Record<string, unknown>[],
        allWorkOrdersForScheduling: allForScheduling,
        equipmentStatusById,
        workerCertExpiryDates,
        rules,
        now: new Date(),
      });
      entity.status = status;
    } catch (err) {
      this.logger.warn(
        `Auto assignment status failed for ${entity.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      entity.status = 'pending';
    }
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
