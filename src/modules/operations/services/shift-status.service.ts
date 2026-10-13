import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { StatusCatalog } from '../../../entities/status-catalog.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';
import { ShiftsQueryService } from './shifts-query.service';
import {
  aggregateShiftStatuses,
  computeShiftStatus,
  ShiftAggregateCounters,
  ShiftStatusValue,
  ShiftCompletionLookup,
  ALL_SHIFT_STATUSES,
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
  private readonly logger = new Logger(ShiftStatusService.name);

  constructor(
    @InjectRepository(StatusCatalog)
    private readonly statusCatalogRepo: Repository<StatusCatalog>,
    @InjectRepository(WorkOrder)
    private readonly workOrdersRepo: Repository<WorkOrder>,
    @InjectRepository(FormSubmission)
    private readonly formSubmissionsRepo: Repository<FormSubmission>,
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

                                                                    
    const workOrders = await this.workOrdersRepo.find({
      where: {},
      withDeleted: false,
    });
    const workOrderIds = workOrders.map((w) => w.id);

                                                    
    const shiftsByWorkOrder = new Map<string, Record<string, unknown>[]>();
    if (workOrderIds.length > 0) {
      const shiftRows = await this.workOrdersRepo.manager
        .createQueryBuilder()
        .select('s.work_order_id', 'workOrderId')
        .addSelect('s.id', 'id')
        .addSelect('s.date', 'date')
        .addSelect('s.status', 'status')
        .from(WorkOrderShift, 's')
        .where('s.work_order_id = ANY(:workOrderIds)', { workOrderIds })
        .getRawMany<{
          workOrderId: string;
          id: string;
          date: string;
          status: string;
        }>();
      const relational = await Promise.all(
        workOrderIds.map((woId) =>
          this.shiftsQuery.loadShiftsForWorkOrder(woId),
        ),
      );
      workOrderIds.forEach((woId, idx) => {
        const hydrated = relational[idx];
        if (hydrated) shiftsByWorkOrder.set(woId, hydrated);
      });
    }

                                                            
    const completion = await this.buildCompletionLookup(workOrderIds);

                                                                      
    const totals: ShiftAggregateCounters = {
      totalShifts: 0,
      customerPending: 0,
      dispatchPending: 0,
      readyToNotify: 0,
      awaitingResponse: 0,
      workersConfirmed: 0,
      shiftCancelled: 0,
      shiftCompleted: 0,
      pmApproved: 0,
      pending: 0,
      workersMissing: 0,
    };
    const effectiveShifts: Array<{
      workOrderId: string;
      shiftId: string;
      status: ShiftStatusValue | null;
      automatic: boolean;
    }> = [];

    for (const wo of workOrders) {
      const shifts = shiftsByWorkOrder.get(wo.id) ?? [];
      const filtered = shifts.filter((s) => {
        const date = typeof s.date === 'string' ? s.date.slice(0, 10) : '';
        if (!date) return false;
        if (from && date < from) return false;
        if (to && date > to) return false;
        return true;
      });
      const partial = aggregateShiftStatuses({
        workOrderId: wo.id,
        shifts: filtered as never,
        completion,
      });
      for (const key of Object.keys(totals) as Array<
        keyof ShiftAggregateCounters
      >) {
        totals[key] += partial[key];
      }
      for (const shift of filtered) {
        const shiftId = typeof shift.id === 'string' ? shift.id : '';
        if (!shiftId) continue;
        const computed = computeShiftStatus({
          workOrderId: wo.id,
          shift: shift as never,
          completion,
        });
        effectiveShifts.push({
          workOrderId: wo.id,
          shiftId,
          status: computed.status,
          automatic: computed.automatic,
        });
      }
    }

    return {
      from: from ?? null,
      to: to ?? null,
      counters: totals,
      shifts: effectiveShifts,
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
                                                                          
                                                               
                                                    
    const rows = await this.formSubmissionsRepo.find({
      where: { workOrderId: In(workOrderIds) },
    });
    const completedKeys = new Set<string>();
    const completed = new Set<string>();
    for (const r of rows) {
      if (r.status !== 'submitted') continue;
      if (!r.shiftId) continue;
      completed.add(`${r.workOrderId}:${r.shiftId}`);
    }
    return {
      isShiftCompleted: (woId, shiftId) => completed.has(`${woId}:${shiftId}`),
    };
  }
}
