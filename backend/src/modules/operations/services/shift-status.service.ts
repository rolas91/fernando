import { normalizeWorkOrderListRange } from '../utils/work-order-list-range.util';
import { loadShiftStatusIndex } from '../utils/shift-status-read.util';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { StatusCatalog } from '../../../entities/status-catalog.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';
import { ShiftsQueryService } from './shifts-query.service';
import {
  computeShiftStatus,
  ShiftAggregateCounters,
  ShiftStatusValue,
  ShiftCompletionLookup,
  ALL_SHIFT_STATUSES,
  buildShiftCompletionLookup,
} from '../utils/shift-status.util';

export interface ShiftCatalogItem {
  value: ShiftStatusValue;
  name: string;
  color: string;
  sortOrder: number;
  automatic: boolean;
  blocksEditing: boolean;
  triggersNotification: boolean;
  requiresApproval: boolean;
}

@Injectable()
export class ShiftStatusService {
  constructor(
    @InjectRepository(StatusCatalog)
    private readonly statusCatalogRepo: Repository<StatusCatalog>,
    @InjectRepository(WorkOrder)
    private readonly workOrdersRepo: Repository<WorkOrder>,
    @InjectRepository(FormSubmission)
    private readonly formSubmissionsRepo: Repository<FormSubmission>,
    @InjectRepository(FormTemplate)
    private readonly formTemplatesRepo: Repository<FormTemplate>,
    @InjectRepository(WorkOrderShift)
    private readonly shiftsRepo: Repository<WorkOrderShift>,
    private readonly shiftsQuery: ShiftsQueryService,
  ) {}

  async listShiftStatuses(): Promise<ShiftCatalogItem[]> {
    const rows = await this.statusCatalogRepo.find({
      where: { scope: 'shift', status: 'active' },
      order: { sortOrder: 'ASC' },
    });
    return rows
      .filter((r) => ALL_SHIFT_STATUSES.includes(r.value as ShiftStatusValue))
      .map((r) => ({
        value: r.value as ShiftStatusValue,
        name: r.name,
        color: r.color,
        sortOrder: r.sortOrder,
        automatic: r.automatic,
        blocksEditing: r.blocksEditing,
        triggersNotification: r.triggersNotification,
        requiresApproval: r.requiresApproval,
      }));
  }

  /**
   * Aggregate counters for every shift whose `date` falls in [from, to].
   *
   * @param from  ISO YYYY-MM-DD inclusive (optional, defaults to no lower bound).
   * @param to    ISO YYYY-MM-DD inclusive (optional, defaults to no upper bound).
   */
  async computeStats(args: { from?: string; to?: string } = {}): Promise<{
    from: string | null;
    to: string | null;
    counters: ShiftAggregateCounters;
    shifts: Array<{
      workOrderId: string;
      shiftId: string;
      status: ShiftStatusValue | null;
      automatic: boolean;
    }>;
  }> {
    const { from, to } = args;
    if (from !== undefined || to !== undefined)
      normalizeWorkOrderListRange({
        from: from ?? '0001-01-01',
        to: to ?? '9999-12-31',
      });
    const { shifts, counters } = await loadShiftStatusIndex(
      this.workOrdersRepo.manager,
      args,
    );
    return {
      from: from ?? null,
      to: to ?? null,
      counters,
      shifts: shifts.map((shift) => ({
        workOrderId: shift.workOrderId,
        shiftId: shift.id,
        status: shift.effectiveStatus as ShiftStatusValue | null,
        automatic: shift.automatic,
      })),
    };
  }

  async computeShiftForWorkOrder(args: {
    workOrderId: string;
    shiftId: string;
  }) {
    const { workOrderId, shiftId } = args;
    const wo = await this.workOrdersRepo.findOne({
      where: { id: workOrderId },
    });
    if (!wo) return null;
    const shifts =
      (await this.shiftsQuery.loadShiftsForWorkOrder(workOrderId)) ?? [];
    const shift = shifts.find((s) => s.id === shiftId) as never;
    if (!shift) return null;
    const completion = await this.buildCompletionLookup([workOrderId]);
    return computeShiftStatus({
      workOrderId,
      shift,
      completion,
    });
  }

  private async buildCompletionLookup(
    workOrderIds: string[],
  ): Promise<ShiftCompletionLookup> {
    if (workOrderIds.length === 0) {
      return { isShiftCompleted: () => false };
    }

    const [templates, shifts, submissions] = await Promise.all([
      this.formTemplatesRepo.find({
        select: { id: true, name: true, category: true, isRequired: true },
      }),
      this.shiftsRepo.find({
        select: { id: true, workOrderId: true, formTemplateIds: true },
        where: { workOrderId: In(workOrderIds) },
      }),
      this.formSubmissionsRepo.find({
        select: {
          workOrderId: true,
          shiftId: true,
          templateId: true,
          status: true,
        },
        where: { workOrderId: In(workOrderIds), status: 'submitted' },
      }),
    ]);

    return buildShiftCompletionLookup(
      shifts.map((shift) => ({
        id: shift.id,
        workOrderId: shift.workOrderId,
        formTemplateIds: shift.formTemplateIds,
      })),
      templates,
      submissions.map((submission) => ({
        workOrderId: submission.workOrderId,
        shiftId: submission.shiftId || '',
        templateId: submission.templateId,
        status: submission.status,
      })),
    );
  }
}
