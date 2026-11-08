import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource, In } from 'typeorm';
import type { UserAccessContext } from '../../access/ports/access.port';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { TimesheetsService } from '../services/timesheets.service';
import { IncidentsService } from '../services/incidents.service';
import { ShiftsQueryService } from '../services/shifts-query.service';
import { WorkOrder } from '../../../entities/work-order.entity';
import { Project } from '../../../entities/project.entity';
import { Client } from '../../../entities/client.entity';
import { Worker } from '../../../entities/worker.entity';
import { Equipment } from '../../../entities/equipment.entity';
import { Timesheet } from '../../../entities/timesheet.entity';
import { Incident } from '../../../entities/incident.entity';
import { ActivityFeedItem } from '../../../entities/activity-feed.entity';
import { normalizeWorkOrderListRange } from '../utils/work-order-list-range.util';
import { pageNumber } from '../utils/paged-catalog.util';
import {
  dashboardAllocation,
  type DashboardShift,
} from '../utils/dashboard-read.util';
@Controller('work-orders/views/dashboard')
@UseGuards(OperationsAuthGuard)
export class DashboardReadController {
  constructor(
    private readonly source: DataSource,
    private readonly shifts: ShiftsQueryService,
    private readonly timesheets: TimesheetsService,
    private readonly incidents: IncidentsService,
  ) {}
  @Get()
  async read(
    @Query() query: Record<string, string>,
    @Req() req: Request & { user?: UserAccessContext },
  ) {
    if (
      req.user &&
      [
        'work-orders.read',
        'projects.read',
        'clients.read',
        'workers.read',
        'equipment.read',
        'timesheets.read',
        'incidents.read',
        'activity-feed.read',
      ].some((permission) => !req.user!.permissions.includes(permission))
    )
      throw new ForbiddenException(
        'Dashboard requires access to its source datasets.',
      );
    const range = normalizeWorkOrderListRange({
      from: query.date,
      to: query.date,
    });
    if (!range) throw new BadRequestException('Dashboard date is required.');
    const start = new Date(query.activityFrom),
      end = new Date(query.activityTo);
    if (
      !query.activityFrom ||
      !query.activityTo ||
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end.getTime() <= start.getTime() ||
      end.getTime() - start.getTime() > 26 * 3600000 ||
      end.getTime() - start.getTime() < 22 * 3600000 ||
      Math.abs(Date.parse(range.from + 'T00:00:00Z') - start.getTime()) >
        14 * 3600000
    )
      throw new BadRequestException(
        'Provide the local day boundaries for dashboard activity.',
      );
    const page = pageNumber(query.activityPage, 1, 10000000),
      limit = pageNumber(query.activityLimit, 25, 50);
    await this.timesheets.prepareForRead();
    await this.incidents.prepareForRead();
    const orders = await this.source
      .getRepository(WorkOrder)
      .createQueryBuilder('wo')
      .where("LOWER(TRIM(wo.status)) NOT IN ('cancelled', 'canceled')")
      .andWhere(
        'EXISTS (SELECT 1 FROM work_order_shifts s WHERE s.work_order_id = wo.id AND s.date = :date AND s.cancelled = false)',
        { date: range.from },
      )
      .orderBy('wo.startDate', 'ASC')
      .addOrderBy('wo.id', 'ASC')
      .getMany();
    const byOrder = await this.shifts.loadShiftsForWorkOrders(
      orders.map((order) => order.id),
      range,
    );
    // This scoped snapshot is read-only; the existing serializer preserves map confirmation fields.
    const workOrders = orders
      .map((order) => ({
        ...order,
        shifts: (
          (byOrder.get(order.id) || []) as unknown as DashboardShift[]
        ).filter((shift) => shift.date === range.from && !shift.cancelled),
      }))
      .filter((order) => order.shifts.length > 0);
    const allocation = dashboardAllocation(workOrders, range.from);
    const activityQuery = this.source
      .getRepository(ActivityFeedItem)
      .createQueryBuilder('activity')
      .where('activity.timestamp >= :start AND activity.timestamp < :end', {
        start,
        end,
      });
    const [
      activeWorkerCount,
      equipmentCount,
      pendingTimesheets,
      openIncidents,
      activityTotal,
      activity,
      projects,
      assignedWorkers,
    ] = await Promise.all([
      this.source.getRepository(Worker).count({ where: { status: 'active' } }),
      this.source.getRepository(Equipment).count(),
      this.source.getRepository(Timesheet).count({
        where: { variant: 'internal', date: range.from, status: 'pending' },
      }),
      this.source.getRepository(Incident).count({
        where: { date: range.from, status: In(['open', 'investigating']) },
      }),
      activityQuery.getCount(),
      activityQuery
        .clone()
        .orderBy('activity.timestamp', 'DESC')
        .addOrderBy('activity.id', 'ASC')
        .skip((page - 1) * limit)
        .take(limit)
        .getMany(),
      workOrders.length
        ? this.source.getRepository(Project).find({
            where: {
              id: In([...new Set(workOrders.map((order) => order.projectId))]),
            },
          })
        : Promise.resolve([] as Project[]),
      allocation.assignedWorkerIds.size
        ? this.source.getRepository(Worker).find({
            select: { id: true, firstName: true, lastName: true, type: true },
            where: {
              id: In([...allocation.assignedWorkerIds]),
              status: 'active',
            },
            order: { firstName: 'ASC', id: 'ASC' },
            take: 6,
          })
        : Promise.resolve([] as Worker[]),
    ]);
    const clients = projects.length
      ? await this.source.getRepository(Client).find({
          where: {
            id: In([...new Set(projects.map((project) => project.clientId))]),
          },
        })
      : [];
    return {
      workOrders,
      projects,
      clients,
      activeWorkerCount,
      equipmentCount,
      assignedWorkers,
      assignedWorkerCount: allocation.assignedWorkerIds.size,
      plannedEquipmentCount: allocation.plannedEquipmentCount,
      todayPlannedEquipment: allocation.todayPlannedEquipment,
      pendingTimesheets,
      openIncidents,
      activeJobs: workOrders.length,
      activity: {
        data: activity,
        meta: {
          page,
          limit,
          total: activityTotal,
          totalPages: Math.ceil(activityTotal / limit),
        },
      },
    };
  }
}
