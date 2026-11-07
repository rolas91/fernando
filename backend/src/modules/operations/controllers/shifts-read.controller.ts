import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource, In } from 'typeorm';
import { WorkOrder } from '../../../entities/work-order.entity';
import { Project } from '../../../entities/project.entity';
import { Client } from '../../../entities/client.entity';
import { OperationsAuthGuard } from '../operations-auth.guard';
import type { UserAccessContext } from '../../access/ports/access.port';
import { ShiftsQueryService } from '../services/shifts-query.service';
import { WorkOrdersService } from '../services/work-orders.service';
import { FormSubmissionsService } from '../services/form-submissions.service';
import { ShiftStatusService } from '../services/shift-status.service';
import { loadShiftStatusIndex } from '../utils/shift-status-read.util';
import { normalizeWorkOrderListRange } from '../utils/work-order-list-range.util';
import { catalogText, pageNumber } from '../utils/paged-catalog.util';
export const SHIFT_LABELS: Record<string, string> = {
  customer_pending: 'Customer Pending',
  dispatch_pending: 'Dispatch Pending',
  ready_to_notify: 'Ready to Notify',
  awaiting_response: 'Awaiting Response',
  workers_confirmed: 'Workers Confirmed',
  shift_cancelled: 'Shift Cancelled',
  shift_completed: 'Shift Completed',
  pm_approved: 'PM Approved',
};
@Controller('work-orders/views/shifts')
@UseGuards(OperationsAuthGuard)
export class ShiftsReadController {
  constructor(
    private readonly source: DataSource,
    private readonly shifts: ShiftsQueryService,
    private readonly orders: WorkOrdersService,
    private readonly submissions: FormSubmissionsService,
    private readonly status: ShiftStatusService,
  ) {}
  private check(actor?: UserAccessContext) {
    if (
      actor &&
      ['work-orders.read', 'projects.read', 'clients.read'].some(
        (permission) => !actor.permissions.includes(permission),
      )
    )
      throw new ForbiddenException(
        'Shift list requires its source read permissions.',
      );
  }
  @Get('metrics')
  async metrics(@Req() req: Request & { user?: UserAccessContext }) {
    this.check(req.user);
    const { shifts } = await loadShiftStatusIndex(this.source.manager);
    const statusCounts: Record<string, number> = Object.fromEntries(
      ['All', ...Object.values(SHIFT_LABELS)].map((label) => [label, 0]),
    );
    const projectIds = new Set<string>(),
      approvedProjectIds = new Set<string>();
    for (const shift of shifts) {
      statusCounts.All++;
      const label = shift.effectiveStatus
        ? SHIFT_LABELS[shift.effectiveStatus]
        : undefined;
      if (label) statusCounts[label]++;
      projectIds.add(shift.projectId);
      if (shift.effectiveStatus === 'pm_approved')
        approvedProjectIds.add(shift.projectId);
    }
    const projects = projectIds.size
      ? await this.source.getRepository(Project).find({
          select: { id: true, number: true, name: true },
          where: { id: In([...projectIds]) },
          order: { number: 'ASC', name: 'ASC', id: 'ASC' },
        })
      : [];
    return {
      statusCounts,
      projects,
      approvedProjectIds: [...approvedProjectIds],
    };
  }
  @Get()
  async list(
    @Query() input: Record<string, string>,
    @Req() req: Request & { user?: UserAccessContext },
  ) {
    this.check(req.user);
    const page = pageNumber(input.page, 1, 10000000),
      limit = 25;
    const range = normalizeWorkOrderListRange({
      from: input.from,
      to: input.to,
    });
    const search = catalogText(input.search).toLowerCase(),
      filter = catalogText(input.status) || 'All',
      projectNumber = catalogText(input.projectNumber, 64),
      projectName = catalogText(input.projectName, 64);
    if (!['All', ...Object.values(SHIFT_LABELS)].includes(filter))
      throw new BadRequestException('Invalid shift status filter.');
    const mode = catalogText(input.mode) || 'list';
    if (!['list', 'calendar', 'board'].includes(mode))
      throw new BadRequestException('Invalid shift view.');
    let pages: Record<string, number> = {};
    if (input.pages !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(catalogText(input.pages, 5000));
      } catch {
        throw new BadRequestException('Invalid board pages.');
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new BadRequestException('Invalid board pages.');
      const entries = Object.entries(parsed);
      if (entries.some(([key]) => !Object.values(SHIFT_LABELS).includes(key)))
        throw new BadRequestException('Invalid board column.');
      pages = Object.fromEntries(
        entries.map(([key, value]) => [
          key,
          pageNumber(
            typeof value === 'number' ? String(value) : value,
            1,
            10000000,
          ),
        ]),
      );
    }
    const { shifts } = await loadShiftStatusIndex(
      this.source.manager,
      range,
      true,
    );
    const matched = shifts.filter(
      (shift) =>
        (!projectNumber || shift.projectId === projectNumber) &&
        (!projectName || shift.projectId === projectName) &&
        (filter === 'All' ||
          SHIFT_LABELS[shift.effectiveStatus || ''] === filter) &&
        `${shift.shiftName} ${shift.createdByName || '—'} ${shift.title} ${shift.orderNumber || ''} ${shift.projectNumber || ''} ${shift.projectName || ''} ${shift.clientName || ''} ${shift.date}`
          .toLowerCase()
          .includes(search),
    );
    matched.sort(
      (a, b) =>
        (b.latestShift || '').localeCompare(a.latestShift || '') ||
        (b.assignmentStart || '').localeCompare(a.assignmentStart || '') ||
        a.workOrderId.localeCompare(b.workOrderId) ||
        `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`) ||
        a.id.localeCompare(b.id),
    );
    let selected = matched.slice((page - 1) * limit, page * limit);
    const columns: Record<
      string,
      { page: number; limit: number; total: number; totalPages: number }
    > = {};
    if (mode === 'board') {
      selected = [];
      for (const label of Object.values(SHIFT_LABELS)) {
        const rows = matched.filter(
            (shift) => SHIFT_LABELS[shift.effectiveStatus || ''] === label,
          ),
          columnPage = pages[label] || 1;
        columns[label] = {
          page: columnPage,
          limit,
          total: rows.length,
          totalPages: Math.ceil(rows.length / limit),
        };
        selected.push(
          ...rows.slice((columnPage - 1) * limit, columnPage * limit),
        );
      }
    }
    const ids = [...new Set(selected.map((shift) => shift.workOrderId))];
    const [orders, byOrder] = await Promise.all([
      ids.length
        ? this.source.getRepository(WorkOrder).find({ where: { id: In(ids) } })
        : Promise.resolve([] as WorkOrder[]),
      this.shifts.loadShiftsForWorkOrders(
        ids,
        undefined,
        selected.map((shift) => shift.id),
      ),
    ]);
    const byId = new Map(orders.map((order) => [order.id, order]));
    const rows = selected.flatMap((entry) => {
      const workOrder = byId.get(entry.workOrderId);
      const shift = byOrder
        .get(entry.workOrderId)
        ?.find((shift) => shift.id === entry.id);
      return workOrder && shift
        ? [
            {
              workOrder: { ...workOrder, shifts: [] },
              shift: { ...shift, effectiveStatus: entry.effectiveStatus },
            },
          ]
        : [];
    });
    const projectIds = [...new Set(orders.map((order) => order.projectId))],
      projects = projectIds.length
        ? await this.source
            .getRepository(Project)
            .find({ where: { id: In(projectIds) } })
        : [];
    const clientIds = [...new Set(projects.map((project) => project.clientId))],
      clients = clientIds.length
        ? await this.source
            .getRepository(Client)
            .find({ where: { id: In(clientIds) } })
        : [];
    return {
      rows,
      columns,
      projects,
      clients,
      meta: {
        page,
        limit,
        total: matched.length,
        totalPages: Math.ceil(matched.length / limit),
      },
    };
  }
  @Get(':workOrderId/:shiftId/detail')
  async detail(
    @Param('workOrderId') workOrderId: string,
    @Param('shiftId') shiftId: string,
    @Req() req: Request & { user?: UserAccessContext },
  ) {
    this.check(req.user);
    if (req.user && !req.user.permissions.includes('form-submissions.read'))
      throw new ForbiddenException('Submission read permission is required.');
    const workOrder = await this.orders.findOne(workOrderId);
    if (!workOrder.shifts?.some((shift) => shift.id === shiftId))
      throw new NotFoundException('Shift not found');
    const [project, submissions, computed] = await Promise.all([
      this.source
        .getRepository(Project)
        .findOne({ where: { id: workOrder.projectId } }),
      this.submissions.findForShiftRead(workOrderId, shiftId, req.user),
      this.status.computeShiftForWorkOrder({ workOrderId, shiftId }),
    ]);
    const client = project?.clientId
      ? await this.source
          .getRepository(Client)
          .findOne({ where: { id: project.clientId } })
      : null;
    return {
      workOrder: {
        ...workOrder,
        shifts: workOrder.shifts.map((shift) =>
          shift.id === shiftId
            ? { ...shift, effectiveStatus: computed?.status }
            : shift,
        ),
      },
      project,
      client,
      submissions,
    };
  }
}
