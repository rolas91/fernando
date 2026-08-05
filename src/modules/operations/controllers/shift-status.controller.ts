import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { UserAccessContext } from '../../access/ports/access.port';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { ShiftStatusService } from '../services/shift-status.service';
import { WorkOrderShiftsWriteService } from '../services/work-order-shifts-write.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { IntegrationsService } from '../../integrations/integrations.service';
import { WorkOrdersService } from '../services/work-orders.service';
import { FormSubmissionsService } from '../services/form-submissions.service';

@ApiTags('operations')
@Controller('work-orders/shifts')
@UseGuards(OperationsAuthGuard)
export class ShiftStatusController {
  constructor(
    private readonly shiftStatus: ShiftStatusService,
    private readonly workOrders: WorkOrdersService,
    private readonly shiftsWrite: WorkOrderShiftsWriteService,
    private readonly realtime: RealtimeGateway,
    private readonly integrations: IntegrationsService,
    private readonly formSubmissions: FormSubmissionsService,
  ) {}

  private assertAdmin(actor?: UserAccessContext) {
    if (!actor || (actor.role !== 'admin' && !actor.roles.includes('admin'))) {
      throw new ForbiddenException('Only an administrator can approve or reopen a shift.');
    }
  }

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
    await this.workOrders.assertShiftMutable(workOrderId, shiftId);
    await this.shiftsWrite.assertShiftNotPmApproved(workOrderId, shiftId);
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
    await this.workOrders.assertShiftMutable(workOrderId, shiftId);
    await this.shiftsWrite.assertShiftNotPmApproved(workOrderId, shiftId);
    const updated = await this.shiftsWrite.cancelShift({ workOrderId, shiftId });
    const notifications = updated
      ? await this.integrations.notifyShiftCancellation(workOrderId, shiftId)
      : { attempted: 0, sent: 0 };
    this.realtime.emitTableUpdated('work_orders');
    return { shift: updated, notifications };
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

  @Post(':workOrderId/:shiftId/pm-approve')
  async approveShift(
    @Param('workOrderId') workOrderId: string,
    @Param('shiftId') shiftId: string,
    @Req() req: Request & { user?: UserAccessContext },
  ) {
    this.assertAdmin(req.user);
    const effective = await this.shiftStatus.computeShiftForWorkOrder({
      workOrderId,
      shiftId,
    });
    if (!effective) throw new NotFoundException(`Shift ${shiftId} not found`);
    if (effective.status !== 'shift_completed') {
      throw new BadRequestException('Only a completed shift can be PM Approved.');
    }
    await this.formSubmissions.regenerateLatestWorkOrderPdfForShift(
      workOrderId,
      shiftId,
      req.user,
    );
    const updated = await this.shiftsWrite.approveShift({
      workOrderId,
      shiftId,
      userId: req.user!.id,
    });
    this.realtime.emitTableUpdated('work_orders');
    return updated;
  }

  @Post(':workOrderId/:shiftId/reopen')
  async reopenShift(
    @Param('workOrderId') workOrderId: string,
    @Param('shiftId') shiftId: string,
    @Req() req: Request & { user?: UserAccessContext },
  ) {
    this.assertAdmin(req.user);
    const updated = await this.shiftsWrite.reopenApprovedShift({ workOrderId, shiftId });
    if (!updated) throw new NotFoundException(`Shift ${shiftId} not found`);
    this.realtime.emitTableUpdated('work_orders');
    return updated;
  }
}
