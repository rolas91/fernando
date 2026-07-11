import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { ShiftStatusService } from '../services/shift-status.service';
import { WorkOrderShiftsWriteService } from '../services/work-order-shifts-write.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

@ApiTags('operations')
@Controller('work-orders/shifts')
@UseGuards(OperationsAuthGuard)
export class ShiftStatusController {
  constructor(
    private readonly shiftStatus: ShiftStatusService,
    private readonly shiftsWrite: WorkOrderShiftsWriteService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * GET /work-orders/shifts/status-catalog
   * Returns the seven shift statuses the calendar uses (manual + automatic),
   * each with its color, sort order and `automatic` flag.
   */
  @Get('status-catalog')
  listStatusCatalog() {
    return this.shiftStatus.listShiftStatuses();
  }

  /**
   * GET /work-orders/shifts/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Returns the seven counters for every shift in the date range plus
   * the convenience aggregates (totalShifts, pending, workersMissing).
   */
  @Get('stats')
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  getStats(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.shiftStatus.computeStats({ from, to });
  }

  /**
   * PATCH /work-orders/shifts/:workOrderId/:shiftId/status
   * Sets the user-pickable manual status of a shift
   * (customer_pending | dispatch_pending | ready_to_notify).
   */
  @Patch(':workOrderId/:shiftId/status')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { status: { type: 'string' } },
      required: ['status'],
    },
  })
  async setManualStatus(
    @Param('workOrderId') workOrderId: string,
    @Param('shiftId') shiftId: string,
    @Body('status') status: string,
  ) {
    const updated = await this.shiftsWrite.setShiftManualStatus({
      workOrderId,
      shiftId,
      status,
    });
    this.realtime.emitTableUpdated('work_orders');
    return updated;
  }

  /**
   * POST /work-orders/shifts/:workOrderId/:shiftId/cancel
   * Manually cancels a shift (sets the cancelled flag → automatic
   * shift_cancelled in the next stats rollup).
   */
  @Post(':workOrderId/:shiftId/cancel')
  async cancelShift(
    @Param('workOrderId') workOrderId: string,
    @Param('shiftId') shiftId: string,
  ) {
    const updated = await this.shiftsWrite.cancelShift({ workOrderId, shiftId });
    this.realtime.emitTableUpdated('work_orders');
    return updated;
  }

  /**
   * POST /work-orders/shifts/:workOrderId/:shiftId/restore
   * Reverses a manual cancellation.
   */
  @Post(':workOrderId/:shiftId/restore')
  async restoreShift(
    @Param('workOrderId') workOrderId: string,
    @Param('shiftId') shiftId: string,
  ) {
    const updated = await this.shiftsWrite.restoreShift({ workOrderId, shiftId });
    this.realtime.emitTableUpdated('work_orders');
    return updated;
  }
}
