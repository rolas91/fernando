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
import { DataSource } from 'typeorm';
import type { UserAccessContext } from '../../access/ports/access.port';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { TimesheetsService } from '../services/timesheets.service';
import { IncidentsService } from '../services/incidents.service';
import { FormSubmissionsService } from '../services/form-submissions.service';
import { CompanySettingsService } from '../services/company-settings.service';
import { Timesheet } from '../../../entities/timesheet.entity';
import { Worker } from '../../../entities/worker.entity';
import { Project } from '../../../entities/project.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { Equipment } from '../../../entities/equipment.entity';
import { Incident } from '../../../entities/incident.entity';
import { normalizeWorkOrderListRange } from '../utils/work-order-list-range.util';
import { pageNumber } from '../utils/paged-catalog.util';
import {
  calculateOperationsReport,
  type ReportWorkOrder,
} from '../utils/operations-report.util';

type ActorRequest = Request & { user?: UserAccessContext };
@Controller('timesheets/reports/operations')
@UseGuards(OperationsAuthGuard)
export class OperationsReportsController {
  constructor(
    private readonly source: DataSource,
    private readonly timesheets: TimesheetsService,
    private readonly incidents: IncidentsService,
    private readonly submissions: FormSubmissionsService,
    private readonly settings: CompanySettingsService,
  ) {}
  @Get()
  async read(@Query() query: Record<string, string>, @Req() req: ActorRequest) {
    const { report, equipmentCounts, incidentCounts, forms } =
      await this.calculate(query, req.user);
    const section = this.section(query.section),
      page = pageNumber(query.page, 1, 10000000),
      limit = pageNumber(query.limit, 25, 50);
    const total =
      section === 'worker_hours'
        ? report.workerHours.length
        : section === 'project_summary'
          ? report.projectSummary.length
          : 0;
    const { workerHours, projectSummary, ...summary } = report;
    return {
      ...summary,
      equipmentCounts,
      incidentCounts,
      forms,
      workerHours: this.publicWorkers(
        section === 'overview'
          ? workerHours.slice(0, 8)
          : section === 'worker_hours'
            ? workerHours.slice((page - 1) * limit, page * limit)
            : [],
      ),
      projectSummary:
        section === 'project_summary'
          ? projectSummary.slice((page - 1) * limit, page * limit)
          : [],
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
  @Get('export')
  async export(
    @Query() query: Record<string, string>,
    @Req() req: ActorRequest,
  ) {
    const section = this.section(query.section);
    if (section === 'overview')
      throw new BadRequestException('Select a report to export.');
    const { report } = await this.calculate(query, req.user);
    return {
      workerHours:
        section === 'worker_hours'
          ? this.publicWorkers(report.workerHours)
          : [],
      projectSummary:
        section === 'project_summary' ? report.projectSummary : [],
    };
  }
  private section(value?: string) {
    const section = value || 'overview';
    if (!['overview', 'worker_hours', 'project_summary'].includes(section))
      throw new BadRequestException('Invalid report section.');
    return section;
  }
  private publicWorkers(
    rows: ReturnType<typeof calculateOperationsReport>['workerHours'],
  ) {
    return rows.map((row) => ({
      ...row,
      worker: {
        id: row.worker.id,
        firstName: row.worker.firstName,
        lastName: row.worker.lastName,
        type: row.worker.type,
      },
    }));
  }
  private async calculate(
    query: Record<string, string>,
    actor?: UserAccessContext,
  ) {
    this.section(query.section);
    pageNumber(query.page, 1, 10000000);
    if (
      actor &&
      [
        'timesheets.read',
        'workers.read',
        'work-orders.read',
        'projects.read',
        'equipment.read',
        'incidents.read',
        'form-submissions.read',
        'form-templates.read',
        'company-settings.read',
      ].some((permission) => !actor.permissions.includes(permission))
    )
      throw new ForbiddenException(
        'Reports require access to their source datasets.',
      );
    const range = normalizeWorkOrderListRange({
      from: query.from,
      to: query.to,
    });
    if (!range)
      throw new BadRequestException('A report date range is required.');
    await this.timesheets.prepareForRead();
    await this.incidents.prepareForRead();
    const internalInRange =
      "t.variant = 'internal' AND t.date BETWEEN :from AND :to";
    const [
      timesheets,
      workers,
      projects,
      orders,
      shifts,
      settings,
      equipmentCounts,
      incidentCounts,
      formCounts,
      templates,
    ] = await Promise.all([
      this.source
        .getRepository(Timesheet)
        .createQueryBuilder('t')
        .select([
          't.id',
          't.workerId',
          't.projectId',
          't.workOrderId',
          't.shiftId',
          't.date',
          't.clockIn',
          't.regularHours',
          't.overtimeHours',
          't.doubleTimeHours',
          't.status',
        ])
        .where(internalInRange, range)
        .orderBy('t.date', 'DESC')
        .addOrderBy('t.id', 'ASC')
        .getMany(),
      this.source
        .getRepository(Worker)
        .createQueryBuilder('worker')
        .select([
          'worker.id',
          'worker.firstName',
          'worker.lastName',
          'worker.type',
          'worker.status',
          'worker.hourlyRate',
        ])
        .where(
          'EXISTS (SELECT 1 FROM timesheets t WHERE t.worker_id = worker.id AND ' +
            internalInRange +
            ')',
          range,
        )
        .orderBy('worker.firstName', 'ASC')
        .addOrderBy('worker.id', 'ASC')
        .getMany(),
      this.source
        .getRepository(Project)
        .createQueryBuilder('project')
        .select([
          'project.id',
          'project.number',
          'project.name',
          'project.status',
          'project.city',
        ])
        .where(
          'EXISTS (SELECT 1 FROM timesheets t WHERE t.project_id = project.id AND ' +
            internalInRange +
            ')',
          range,
        )
        .orderBy('project.number', 'ASC')
        .addOrderBy('project.id', 'ASC')
        .getMany(),
      this.source
        .getRepository(WorkOrder)
        .createQueryBuilder('wo')
        .select(['wo.id', 'wo.projectId', 'wo.startDate', 'wo.endDate'])
        .where(
          '(wo.start_date <= :to AND COALESCE(wo.end_date, wo.start_date) >= :from) OR EXISTS (SELECT 1 FROM work_order_shifts s WHERE s.work_order_id = wo.id AND s.date BETWEEN :from AND :to) OR EXISTS (SELECT 1 FROM timesheets t WHERE t.work_order_id = wo.id AND ' +
            internalInRange +
            ')',
          range,
        )
        .orderBy('wo.startDate', 'ASC')
        .addOrderBy('wo.id', 'ASC')
        .getMany(),
      this.source
        .getRepository(WorkOrderShift)
        .createQueryBuilder('s')
        .innerJoin(
          'work_orders',
          'wo',
          'wo.id = s.work_order_id AND wo.deleted_at IS NULL',
        )
        .select([
          's.id',
          's.workOrderId',
          's.date',
          's.shiftName',
          's.startTime',
          's.defaultRoleStartTime',
        ])
        .where(
          's.date BETWEEN :from AND :to OR EXISTS (SELECT 1 FROM timesheets t WHERE t.shift_id = s.id AND t.work_order_id = wo.id AND ' +
            internalInRange +
            ')',
          range,
        )
        .orderBy('s.date', 'ASC')
        .addOrderBy('s.displayOrder', 'ASC')
        .addOrderBy('s.id', 'ASC')
        .getMany(),
      this.settings.findAll(),
      this.source
        .getRepository(Equipment)
        .createQueryBuilder('equipment')
        .select('equipment.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('equipment.status')
        .getRawMany<{ status: string; count: string }>(),
      this.source
        .getRepository(Incident)
        .createQueryBuilder('incident')
        .select('incident.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('incident.date BETWEEN :from AND :to', range)
        .groupBy('incident.status')
        .getRawMany<{ status: string; count: string }>(),
      this.submissions.summaryForRange(range.from, range.to, actor),
      this.source
        .getRepository(FormTemplate)
        .find({ select: { id: true, name: true, category: true } }),
    ]);
    const shiftGroups = new Map<string, typeof shifts>();
    for (const shift of shifts) {
      if (!shiftGroups.has(shift.workOrderId))
        shiftGroups.set(shift.workOrderId, []);
      shiftGroups.get(shift.workOrderId)!.push(shift);
    }
    const workOrders: ReportWorkOrder[] = orders.map((order) => ({
      id: order.id,
      projectId: order.projectId,
      startDate: order.startDate || undefined,
      endDate: order.endDate || undefined,
      shifts: shiftGroups.get(order.id) || [],
    }));
    const report = calculateOperationsReport({
      timesheets,
      workers,
      projects,
      workOrders,
      dateRange: { start: range.from, end: range.to },
      settings: {
        overtimeRules: {
          overtimeMultiplier: 1.5,
          doubleTimeMultiplier: 2,
          nightShiftPremium: 3,
          overtimeNightPremium: 4.5,
          doubleTimeNightPremium: 6,
          ...(settings[0]?.overtimeRules || {}),
        },
      },
    });
    const byTemplate = new Map(
      formCounts.map((row) => [row.templateId, row.count]),
    );
    return {
      report,
      equipmentCounts: Object.fromEntries(
        equipmentCounts.map((row) => [row.status, Number(row.count)]),
      ),
      incidentCounts: {
        total: incidentCounts.reduce((sum, row) => sum + Number(row.count), 0),
        open: incidentCounts
          .filter((row) => ['open', 'investigating'].includes(row.status))
          .reduce((sum, row) => sum + Number(row.count), 0),
      },
      forms: {
        total: formCounts.reduce((sum, row) => sum + row.count, 0),
        summary: templates
          .map((template) => ({
            template,
            count: byTemplate.get(template.id) || 0,
          }))
          .filter((row) => row.count > 0)
          .sort(
            (a, b) =>
              b.count - a.count ||
              a.template.name.localeCompare(b.template.name),
          ),
      },
    };
  }
}
