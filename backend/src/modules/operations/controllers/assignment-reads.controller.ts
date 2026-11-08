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
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';
import type { UserAccessContext } from '../../access/ports/access.port';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { WorkOrdersService } from '../services/work-orders.service';
import { ShiftsQueryService } from '../services/shifts-query.service';
import { normalizeWorkOrderListRange } from '../utils/work-order-list-range.util';
import { pageNumber } from '../utils/paged-catalog.util';
type ActorRequest = Request & { user?: UserAccessContext };
@Controller('work-orders/views/assignments')
@UseGuards(OperationsAuthGuard)
export class AssignmentReadsController {
  constructor(
    private readonly source: DataSource,
    private readonly shifts: ShiftsQueryService,
    private readonly orders: WorkOrdersService,
  ) {}
  private check(req: ActorRequest, permissions = ['work-orders.read']) {
    if (
      req.user &&
      permissions.some(
        (permission) => !req.user!.permissions.includes(permission),
      )
    )
      throw new ForbiddenException(
        'Assignment source read permission is required',
      );
  }
  private range(from?: string, to?: string) {
    return normalizeWorkOrderListRange({ from, to });
  }
  private async hydrate(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.source
      .getRepository(WorkOrder)
      .find({ where: { id: In(ids) } });
    const shifts = await this.shifts.loadShiftsForWorkOrders(
      rows.map((row) => row.id),
    );
    const map = new Map(
      rows.map((row) => [row.id, { ...row, shifts: shifts.get(row.id) || [] }]),
    );
    return ids.flatMap((id) => (map.has(id) ? [map.get(id)!] : []));
  }
  @Get('records')
  records(@Query('ids') value: string, @Req() req: ActorRequest) {
    this.check(req);
    let ids: unknown;
    try {
      if (typeof value !== 'string' || value.length > 3000) throw new Error();
      ids = JSON.parse(value);
    } catch {
      throw new BadRequestException('Provide assignment IDs');
    }
    if (
      !Array.isArray(ids) ||
      ids.length > 32 ||
      ids.some((id) => typeof id !== 'string' || !id || id.length > 64)
    )
      throw new BadRequestException(
        'At most 32 valid assignment IDs are allowed',
      );
    return this.hydrate([...new Set(ids as string[])]);
  }
  @Get('shift-record/:shiftId')
  async shiftRecord(
    @Param('shiftId') shiftId: string,
    @Req() req: ActorRequest,
  ) {
    this.check(req);
    const shift = await this.source
      .getRepository(WorkOrderShift)
      .findOne({ where: { id: shiftId } });
    if (!shift) throw new NotFoundException('Shift not found');
    return this.orders.findOne(shift.workOrderId);
  }
  @Get('record/:id')
  record(@Param('id') id: string, @Req() req: ActorRequest) {
    this.check(req);
    return this.orders.findOne(id);
  }
  @Get('schedule-scope')
  async scheduleScope(
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() req: ActorRequest,
  ) {
    this.check(req);
    const range = this.range(from, to);
    if (!range || (Date.parse(to) - Date.parse(from)) / 86400000 > 61)
      throw new BadRequestException(
        'Schedule scope must be a valid range of at most 62 days',
      );
    const rows = await this.source
      .getRepository(WorkOrder)
      .createQueryBuilder('wo')
      .select([
        'wo.id',
        'wo.projectId',
        'wo.title',
        'wo.orderNumber',
        'wo.status',
        'wo.startDate',
        'wo.endDate',
        'wo.createdAt',
      ])
      .addSelect(
        "(SELECT MAX(latest.date::text || 'T' || COALESCE(NULLIF(latest.start_time, ''), '00:00')) FROM work_order_shifts latest WHERE latest.work_order_id = wo.id)",
        'latestShiftTimestamp',
      )
      .where(
        '( (wo.startDate <= :to AND wo.endDate >= :from) OR EXISTS (SELECT 1 FROM work_order_shifts scoped WHERE scoped.work_order_id = wo.id AND scoped.date BETWEEN :from AND :to))',
        range,
      )
      .getRawAndEntities<{ latestShiftTimestamp?: string }>();
    const byId = await this.shifts.loadShiftsForWorkOrders(
      rows.entities.map((row) => row.id),
      range,
    );
    return {
      readOnly: true,
      data: rows.entities.map((row, index) => ({
        ...row,
        latestShiftTimestamp: rows.raw[index]?.latestShiftTimestamp || '',
        shifts: byId.get(row.id) || [],
      })),
    };
  }
  @Get('page')
  async page(@Query() input: Record<string, string>, @Req() req: ActorRequest) {
    this.check(req);
    const visible = (permission: string) =>
      !req.user || req.user.permissions.includes(permission);
    const projectsVisible = visible('projects.read');
    const clientsVisible = projectsVisible && visible('clients.read');
    const typesVisible = visible('work-order-types.read');
    const page = pageNumber(input.page, 1, 10000000),
      limit = pageNumber(input.limit, 25, 50);
    const range = this.range(input.from, input.to),
      calendar = this.range(input.calendarFrom, input.calendarTo);
    if (
      calendar &&
      (Date.parse(calendar.to) - Date.parse(calendar.from)) / 86400000 > 61
    )
      throw new BadRequestException('Calendar range is too large');
    if (input.sortBy && !['date', 'project'].includes(input.sortBy))
      throw new BadRequestException('Invalid assignment sort');
    if (input.sortDir && !['asc', 'desc'].includes(input.sortDir))
      throw new BadRequestException('Invalid assignment direction');
    const query = this.source
      .getRepository(WorkOrder)
      .createQueryBuilder('wo')
      .leftJoin('projects', 'p', 'p.id = wo.project_id')
      .leftJoin('clients', 'c', 'c.id = p.client_id')
      .leftJoin('work_order_types', 'kind', 'kind.id = wo.work_order_type_id')
      .select('wo.id', 'id')
      .addSelect("to_char(wo.startDate, 'YYYY-MM-DD')", 'startDate')
      .addSelect(projectsVisible ? 'p.name' : "''", 'projectName')
      .orderBy('wo.startDate', 'ASC')
      .addOrderBy('wo.id', 'ASC');
    if (range)
      query.andWhere(
        '((wo.startDate <= :to AND wo.endDate >= :from) OR EXISTS (SELECT 1 FROM work_order_shifts scoped WHERE scoped.work_order_id = wo.id AND scoped.date BETWEEN :from AND :to))',
        range,
      );
    if (calendar)
      query.andWhere(
        'EXISTS (SELECT 1 FROM work_order_shifts grid_shift WHERE grid_shift.work_order_id = wo.id AND grid_shift.date BETWEEN :calendarFrom AND :calendarTo)',
        { calendarFrom: calendar.from, calendarTo: calendar.to },
      );
    if (input.search) {
      if (input.search.length > 500)
        throw new BadRequestException('Search is too long');
      query.andWhere(
        'POSITION(:search IN LOWER(' +
          [
            "COALESCE(wo.title,'')",
            projectsVisible ? "COALESCE(p.name,'')" : "''",
            clientsVisible ? "COALESCE(c.name,'')" : "''",
            projectsVisible ? "COALESCE(p.city,'')" : "''",
            "COALESCE(wo.order_number,'')",
            typesVisible ? "COALESCE(kind.name,'')" : "''",
          ].join(' || ') +
          ')) > 0',
        { search: input.search.toLowerCase() },
      );
    }
    // Match the existing browser localeCompare ordering, over projected keys only.
    const matches = await query.getRawMany<{
      id: string;
      startDate: string | null;
      projectName: string | null;
    }>();
    matches.sort((a, b) => {
      const key = input.sortBy === 'project' ? 'projectName' : 'startDate';
      const cmp = (a[key] || '').localeCompare(b[key] || '');
      return input.sortDir === 'desc' ? -cmp : cmp;
    });
    const totalItems = await this.source.getRepository(WorkOrder).count();
    return {
      data: await this.hydrate(
        matches.slice((page - 1) * limit, page * limit).map((row) => row.id),
      ),
      meta: {
        page,
        limit,
        total: matches.length,
        totalPages: Math.ceil(matches.length / limit),
        totalItems,
      },
    };
  }
  @Get('conflict-index')
  async conflicts(@Req() req: ActorRequest) {
    this.check(req);
    const rows = await this.source
      .getRepository(WorkOrderShift)
      .createQueryBuilder('s')
      .innerJoin(
        'work_orders',
        'wo',
        'wo.id = s.work_order_id AND wo.deleted_at IS NULL',
      )
      .innerJoin('work_order_shift_roles', 'r', 'r.shift_id = s.id')
      .innerJoin('work_order_shift_role_workers', 'rw', 'rw.role_id = r.id')
      .select('wo.id', 'workOrderId')
      .addSelect('wo.project_id', 'projectId')
      .addSelect('wo.title', 'title')
      .addSelect('wo.status', 'assignmentStatus')
      .addSelect('s.id', 'id')
      .addSelect('s.date::text', 'date')
      .addSelect('s.startTime', 'startTime')
      .addSelect('s.endTime', 'endTime')
      .addSelect('s.status', 'status')
      .addSelect('s.cancelled', 'cancelled')
      .addSelect('r.id', 'roleId')
      .addSelect('r.start_time', 'roleStart')
      .addSelect('rw.worker_id', 'workerId')
      .addSelect('rw.confirmation_status', 'confirmationStatus')
      .orderBy('wo.start_date', 'ASC')
      .addOrderBy('wo.id', 'ASC')
      .addOrderBy('s.date', 'ASC')
      .addOrderBy('s.display_order', 'ASC')
      .addOrderBy('r.id', 'ASC')
      .getRawMany<{
        workOrderId: string;
        projectId: string;
        title: string;
        assignmentStatus: string;
        id: string;
        date: string;
        startTime: string;
        endTime: string;
        status: string;
        cancelled: boolean;
        roleId: string;
        roleStart: string;
        workerId: string;
        confirmationStatus: string;
      }>();
    const orders = new Map<
      string,
      {
        id: string;
        projectId: string;
        title: string;
        status: string;
        shifts: Record<string, unknown>[];
      }
    >();
    const shifts = new Map<
      string,
      {
        id: string;
        date: string;
        startTime: string;
        endTime: string;
        status: string;
        cancelled: boolean;
        roles: {
          id: string;
          startTime: string;
          assignedWorkers: string[];
          workerConfirmations: { workerId: string; status: string }[];
        }[];
      }
    >();
    for (const row of rows) {
      let wo = orders.get(row.workOrderId);
      if (!wo) {
        wo = {
          id: row.workOrderId,
          projectId: row.projectId,
          title: row.title,
          status: row.assignmentStatus,
          shifts: [],
        };
        orders.set(wo.id, wo);
      }
      let shift = shifts.get(row.id);
      if (!shift) {
        shift = {
          id: row.id,
          date: row.date,
          startTime: row.startTime,
          endTime: row.endTime,
          status: row.status,
          cancelled: row.cancelled,
          roles: [],
        };
        shifts.set(row.id, shift);
        wo.shifts.push(shift);
      }
      let role = shift.roles.find((role) => role.id === row.roleId);
      if (!role) {
        role = {
          id: row.roleId,
          startTime: row.roleStart,
          assignedWorkers: [],
          workerConfirmations: [],
        };
        shift.roles.push(role);
      }
      if (!role.assignedWorkers.includes(row.workerId)) {
        role.assignedWorkers.push(row.workerId);
        role.workerConfirmations.push({
          workerId: row.workerId,
          status: row.confirmationStatus,
        });
      }
    }
    return { readOnly: true, data: [...orders.values()] };
  }
}
