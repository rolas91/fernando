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
import { Project } from '../../../entities/project.entity';
import { Client } from '../../../entities/client.entity';
import { Worker } from '../../../entities/worker.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { StatusCatalog } from '../../../entities/status-catalog.entity';
import type { UserAccessContext } from '../../access/ports/access.port';
import { OperationsAuthGuard } from '../operations-auth.guard';
import {
  catalogQuery,
  pageNumber,
  type CatalogListInput,
} from '../utils/paged-catalog.util';
import { normalizeWorkOrderListRange } from '../utils/work-order-list-range.util';

type ActorRequest = Request & { user?: UserAccessContext };
interface ProjectDay {
  projectId: string;
  date: string;
  shifts: string;
  workers: string;
}
interface AssignmentSummary {
  id: string;
  title: string;
  orderNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  shiftCount: string;
  assigned: string;
  required: string;
}

@Controller('projects')
@UseGuards(OperationsAuthGuard)
export class ProjectViewsController {
  constructor(private readonly source: DataSource) {}

  @Get('views/calendar')
  async calendar(
    @Query() input: Record<string, string>,
    @Req() req: ActorRequest,
  ) {
    this.requirePermissions(req.user, [
      'projects.read',
      'clients.read',
      'work-orders.read',
    ]);
    const range = normalizeWorkOrderListRange({
      from: input.from,
      to: input.to,
    });
    if (
      !range ||
      (Date.parse(range.to) - Date.parse(range.from)) / 86400000 > 61
    )
      throw new BadRequestException(
        'Project calendar requires a range of at most 62 days.',
      );
    const query = catalogQuery(
      this.source.getRepository(Project),
      'projects',
      await this.withStatusOrder(input),
    );
    query.andWhere(
      'EXISTS (SELECT 1 FROM work_orders wo JOIN work_order_shifts s ON s.work_order_id = wo.id WHERE wo.project_id = item.id AND wo.deleted_at IS NULL AND s.date BETWEEN :from AND :to)',
      range,
    );
    const projects = await query.getMany();
    if (!projects.length) return { projects: [], clients: [], days: [] };
    const days = await this.source
      .getRepository(WorkOrder)
      .createQueryBuilder('wo')
      .innerJoin('work_order_shifts', 's', 's.work_order_id = wo.id')
      .leftJoin('work_order_shift_roles', 'r', 'r.shift_id = s.id')
      .leftJoin('work_order_shift_role_workers', 'rw', 'rw.role_id = r.id')
      .select('wo.projectId', 'projectId')
      .addSelect('s.date::text', 'date')
      .addSelect('COUNT(DISTINCT s.id)', 'shifts')
      .addSelect('COUNT(DISTINCT rw.worker_id)', 'workers')
      .where('wo.projectId IN (:...ids)', {
        ids: projects.map((project) => project.id),
      })
      .andWhere('s.date BETWEEN :from AND :to', range)
      .groupBy('wo.projectId')
      .addGroupBy('s.date')
      .orderBy('s.date', 'ASC')
      .getRawMany<ProjectDay>();
    const clients = await this.source.getRepository(Client).find({
      select: { id: true, name: true },
      where: {
        id: In([...new Set(projects.map((project) => project.clientId))]),
      },
    });
    return {
      projects,
      clients,
      days: days.map((day) => ({
        ...day,
        shifts: Number(day.shifts),
        workers: Number(day.workers),
      })),
    };
  }

  @Get(':id/views/detail')
  async detail(
    @Param('id') id: string,
    @Query('page') pageValue: string | undefined,
    @Req() req: ActorRequest,
  ) {
    this.requirePermissions(req.user, [
      'projects.read',
      'clients.read',
      'work-orders.read',
      'workers.read',
    ]);
    const page = pageNumber(pageValue, 1, 10000000),
      limit = 25;
    const project = await this.source
      .getRepository(Project)
      .findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    const assignments = this.source
      .getRepository(WorkOrder)
      .createQueryBuilder('wo')
      .where('wo.projectId = :id', { id });
    const total = await assignments.getCount();
    const data = await assignments
      .clone()
      .select('wo.id', 'id')
      .addSelect('wo.title', 'title')
      .addSelect('wo.orderNumber', 'orderNumber')
      .addSelect('wo.start_date::text', 'startDate')
      .addSelect('wo.end_date::text', 'endDate')
      .addSelect(
        '(SELECT COUNT(*) FROM work_order_shifts s WHERE s.work_order_id = wo.id)',
        'shiftCount',
      )
      .addSelect(
        '(SELECT COUNT(*) FROM work_order_shifts s JOIN work_order_shift_roles r ON r.shift_id = s.id JOIN work_order_shift_role_workers rw ON rw.role_id = r.id WHERE s.work_order_id = wo.id)',
        'assigned',
      )
      .addSelect(
        '(SELECT COALESCE(SUM(r.required_count), 0) FROM work_order_shifts s JOIN work_order_shift_roles r ON r.shift_id = s.id WHERE s.work_order_id = wo.id)',
        'required',
      )
      .orderBy('wo.createdAt', 'DESC')
      .addOrderBy('wo.id', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<AssignmentSummary>();
    const workerQuery = this.source
      .getRepository(Worker)
      .createQueryBuilder('worker')
      .where(
        'EXISTS (SELECT 1 FROM work_order_shift_role_workers rw JOIN work_order_shift_roles r ON r.id = rw.role_id JOIN work_order_shifts s ON s.id = r.shift_id JOIN work_orders wo ON wo.id = s.work_order_id WHERE rw.worker_id = worker.id AND wo.project_id = :id AND wo.deleted_at IS NULL)',
        { id },
      );
    const [client, workerCount, workers] = await Promise.all([
      this.source.getRepository(Client).findOne({
        select: { id: true, name: true },
        where: { id: project.clientId },
      }),
      workerQuery.getCount(),
      workerQuery
        .clone()
        .select([
          'worker.id',
          'worker.firstName',
          'worker.lastName',
          'worker.type',
        ])
        .orderBy('worker.firstName', 'ASC')
        .addOrderBy('worker.lastName', 'ASC')
        .addOrderBy('worker.id', 'ASC')
        .take(8)
        .getMany(),
    ]);
    return {
      project,
      client,
      workers,
      workerCount,
      assignments: {
        data: data.map((row) => ({
          ...row,
          shiftCount: Number(row.shiftCount),
          assigned: Number(row.assigned),
          required: Number(row.required),
        })),
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    };
  }

  private requirePermissions(
    actor: UserAccessContext | undefined,
    permissions: string[],
  ) {
    if (
      actor &&
      permissions.some((permission) => !actor.permissions.includes(permission))
    )
      throw new ForbiddenException(
        'Project view requires access to its related datasets.',
      );
  }
  private async withStatusOrder(input: CatalogListInput) {
    if (input.sort !== 'status') return input;
    const statuses = await this.source.getRepository(StatusCatalog).find({
      where: { scope: 'project', status: 'active' },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    statuses.sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        (a.name ?? '').localeCompare(b.name ?? ''),
    );
    return { ...input, statusOrder: statuses.map((status) => status.value) };
  }
}
