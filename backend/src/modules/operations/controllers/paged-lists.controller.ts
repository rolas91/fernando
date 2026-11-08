import type { Request } from 'express';
import type { UserAccessContext } from '../../access/ports/access.port';
import { IncidentsService } from '../services/incidents.service';
import { FormSubmissionsService } from '../services/form-submissions.service';
import { User } from '../../../entities/user.entity';
import { In } from 'typeorm';
import { isUUID } from 'class-validator';
import { WorkersService } from '../services/workers.service';
import { StatusCatalog } from '../../../entities/status-catalog.entity';
import { TimesheetsService } from '../services/timesheets.service';
import {
  catalogQuery,
  CATALOG_FIELDS,
  pageNumber,
  type PagedCatalog,
  type CatalogListInput,
} from '../utils/paged-catalog.util';
import {
  Controller,
  Req,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { DataSource, EntityTarget, Repository } from 'typeorm';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { Worker } from '../../../entities/worker.entity';
import { Project } from '../../../entities/project.entity';
import { Client } from '../../../entities/client.entity';
import { Equipment } from '../../../entities/equipment.entity';
import { Material } from '../../../entities/material.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { Timesheet } from '../../../entities/timesheet.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { Incident } from '../../../entities/incident.entity';

interface CatalogRow {
  id: string;
}

const resources: Record<string, EntityTarget<CatalogRow>> = {
  workers: Worker,
  projects: Project,
  clients: Client,
  equipment: Equipment,
  materials: Material,
  'work-orders': WorkOrder,
  timesheets: Timesheet,
  'form-templates': FormTemplate,
  'form-submissions': FormSubmission,
  incidents: Incident,
};

@Controller('paged')
@UseGuards(OperationsAuthGuard)
export class PagedListsController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly timesheets: TimesheetsService,
    private readonly workers: WorkersService,
    private readonly incidents: IncidentsService,
    private readonly submissions: FormSubmissionsService,
  ) {}

  @Get(':resource')
  async list(
    @Param('resource') resource: string,
    @Query('page') pageValue?: string,
    @Query('limit') limitValue?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('sort') sort?: string,
    @Query('direction') direction?: string,
    @Req() req?: Request & { user?: UserAccessContext },
  ) {
    const entity = Object.prototype.hasOwnProperty.call(resources, resource)
      ? resources[resource]
      : undefined;
    if (!entity)
      throw new BadRequestException(`Unsupported paged resource: ${resource}`);
    const page = pageNumber(pageValue, 1, 10000000);
    const limit = pageNumber(
      limitValue,
      Object.prototype.hasOwnProperty.call(CATALOG_FIELDS, resource) ? 25 : 10,
      100,
    );
    if (resource === 'form-submissions') {
      const result = await this.submissions.findPaged(
        pageValue,
        limitValue,
        search,
        req?.user,
      );
      return {
        ...result,
        lookups: await this.pageLookups(result.data, resource, req?.user),
      };
    }
    if (resource === 'incidents') await this.incidents.prepareForRead();
    const repository = this.dataSource.getRepository(entity);
    if (Object.prototype.hasOwnProperty.call(CATALOG_FIELDS, resource)) {
      return this.catalogPage(
        resource as PagedCatalog,
        repository,
        { search, status, type, sort, direction },
        page,
        limit,
        req?.user,
      );
    }
    if (search !== undefined || status !== undefined || type !== undefined)
      throw new BadRequestException(
        'Filters are not yet supported for this paged resource.',
      );
    const [data, total] = await repository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { id: 'ASC' },
    });
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async catalogPage(
    resource: PagedCatalog,
    repository: Repository<CatalogRow>,
    input: CatalogListInput,
    page: number,
    limit: number,
    actor?: UserAccessContext,
  ) {
    const query = await this.buildQuery(repository, resource, input);
    const [pageRows, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const data =
      resource === 'workers'
        ? await this.workers.findManyByIds(pageRows.map((row) => row.id))
        : pageRows;
    const summary = await repository
      .createQueryBuilder('item')
      .select('item.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('item.status')
      .getRawMany<{ status: string; count: string }>();
    const statusCounts = Object.fromEntries(
      summary.map((row) => [row.status, Number(row.count)]),
    );
    const projectCounts = Object.create(null) as Record<string, number>;
    if (resource === 'clients' && data.length) {
      const counts = await this.dataSource
        .getRepository(Project)
        .createQueryBuilder('project')
        .select('project.clientId', 'clientId')
        .addSelect('COUNT(*)', 'count')
        .where('project.clientId IN (:...ids)', {
          ids: data.map((row) => row.id),
        })
        .groupBy('project.clientId')
        .getRawMany<{ clientId: string; count: string }>();
      counts.forEach((row) => {
        projectCounts[row.clientId] = Number(row.count);
      });
    }
    const relatedClients =
      resource === 'projects' && data.length
        ? await this.dataSource.getRepository(Client).find({
            select: { id: true, name: true },
            where: {
              id: In([
                ...new Set(data.map((row) => (row as Project).clientId)),
              ]),
            },
          })
        : [];
    const projectMetrics: Record<
      string,
      { workOrders: number; workers: number }
    > = Object.create(null) as Record<
      string,
      { workOrders: number; workers: number }
    >;
    if (resource === 'projects' && data.length) {
      const metrics = await this.dataSource
        .getRepository(WorkOrder)
        .createQueryBuilder('wo')
        .select('wo.projectId', 'projectId')
        .addSelect('COUNT(*)', 'workOrders')
        .addSelect(
          'SUM((SELECT COUNT(DISTINCT assigned.worker_id) FROM work_order_shifts shift JOIN work_order_shift_roles role ON role.shift_id = shift.id JOIN work_order_shift_role_workers assigned ON assigned.role_id = role.id WHERE shift.work_order_id = wo.id))',
          'workers',
        )
        .where('wo.projectId IN (:...ids)', { ids: data.map((row) => row.id) })
        .groupBy('wo.projectId')
        .getRawMany<{
          projectId: string;
          workOrders: string;
          workers: string;
        }>();
      metrics.forEach((row) => {
        projectMetrics[row.projectId] = {
          workOrders: Number(row.workOrders),
          workers: Number(row.workers),
        };
      });
    }
    return {
      data,
      relatedClients,
      projectMetrics,
      lookups:
        resource === 'incidents'
          ? await this.pageLookups(data, resource, actor)
          : undefined,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        totalItems: summary.reduce((sum, row) => sum + Number(row.count), 0),
        statusCounts,
      },
      projectCounts,
    };
  }

  private async pageLookups(
    rows: Array<{
      id: string;
      projectId?: string;
      workOrderId?: string;
      workerId?: string;
      reportedBy?: string;
    }>,
    resource: string,
    actor?: UserAccessContext,
  ) {
    const permitted = (permission: string) =>
      !actor || actor.permissions.includes(permission);
    const ids = (
      key: 'projectId' | 'workOrderId' | 'workerId' | 'reportedBy',
    ) => [
      ...new Set(
        rows.map((row) => row[key]).filter((id): id is string => Boolean(id)),
      ),
    ];
    const projectIds = ids('projectId'),
      assignmentIds = ids('workOrderId'),
      workerIds =
        resource === 'incidents' ? ids('reportedBy') : ids('workerId');
    // Worker IDs may be legacy strings; only users.id requires UUID values.
    const userIds = workerIds.filter((id) => isUUID(id));
    const [projects, workOrders, workers, users] = await Promise.all([
      projectIds.length && permitted('projects.read')
        ? this.dataSource.getRepository(Project).find({
            select: { id: true, name: true },
            where: { id: In(projectIds) },
          })
        : Promise.resolve([] as Project[]),
      assignmentIds.length && permitted('work-orders.read')
        ? this.dataSource.getRepository(WorkOrder).find({
            select: { id: true, title: true, projectId: true },
            where: { id: In(assignmentIds) },
          })
        : Promise.resolve([] as WorkOrder[]),
      workerIds.length && permitted('workers.read')
        ? this.dataSource.getRepository(Worker).find({
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
            where: { id: In(workerIds) },
          })
        : Promise.resolve([] as Worker[]),
      resource === 'form-submissions' &&
      userIds.length &&
      permitted('users.read')
        ? this.dataSource.getRepository(User).find({
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
            where: { id: In(userIds) },
          })
        : Promise.resolve([] as User[]),
    ] as const);
    const submitters = Object.create(null) as Record<string, string>;
    workers.forEach((worker) => {
      submitters[worker.id] =
        (worker.firstName + ' ' + worker.lastName).trim() ||
        worker.email ||
        worker.id;
    });
    users.forEach((user) => {
      submitters[user.id] =
        (user.firstName + ' ' + user.lastName).trim() || user.email;
    });
    return { projects, workOrders, workers, submitters };
  }

  private async buildQuery(
    repository: Repository<CatalogRow>,
    resource: PagedCatalog,
    input: CatalogListInput,
  ) {
    if (resource === 'projects' && input.sort === 'status') {
      const statuses = await this.dataSource.getRepository(StatusCatalog).find({
        where: { scope: 'project', status: 'active' },
        order: { sortOrder: 'ASC', name: 'ASC' },
      });
      statuses.sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          (a.name ?? '').localeCompare(b.name ?? ''),
      );
      input = { ...input, statusOrder: statuses.map((status) => status.value) };
    }
    return catalogQuery(repository, resource, input);
  }

  @Get(':resource/summary')
  async summary(@Param('resource') resource: string) {
    if (resource !== 'timesheets')
      throw new BadRequestException('Unsupported resource summary.');
    return this.timesheets.pendingSummary();
  }

  @Get(':resource/export')
  async exportCatalog(
    @Param('resource') resource: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('sort') sort?: string,
    @Query('direction') direction?: string,
  ) {
    if (!Object.prototype.hasOwnProperty.call(CATALOG_FIELDS, resource))
      throw new BadRequestException('Unsupported catalog export.');
    const query = await this.buildQuery(
      this.dataSource.getRepository(resources[resource]),
      resource as PagedCatalog,
      { search, status, type, sort, direction },
    );
    const rows = await query.getMany();
    return resource === 'workers'
      ? this.workers.findManyByIds(rows.map((row) => row.id))
      : rows;
  }
}
