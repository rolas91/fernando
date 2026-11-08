import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Request } from 'express';
import type { UserAccessContext } from '../../access/ports/access.port';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { TimesheetsService } from '../services/timesheets.service';
import { CompanySettingsService } from '../services/company-settings.service';
import { Shift as ShiftEntity } from '../../../entities/shift.entity';
import {
  calculatePayroll,
  type PayrollInput,
  type PayrollTimesheet,
  type Shift,
} from '../utils/payroll-report.util';
import { catalogText, pageNumber } from '../utils/paged-catalog.util';

interface PayrollRow extends PayrollTimesheet {
  firstName: string | null;
  lastName: string | null;
  hourlyRate: string | null;
  projectName: string | null;
  projectNumber: string | null;
  orderNumber: string;
  shiftDate: string;
  shiftName: string;
  shiftTemplateId: string | null;
  startTime: string;
  defaultRoleStartTime: string | null;
  roleStartTime: string | null;
}
@Controller('timesheets/reports/payroll')
@UseGuards(OperationsAuthGuard)
export class PayrollReportController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly timesheets: TimesheetsService,
    private readonly settings: CompanySettingsService,
  ) {}

  @Get()
  async list(
    @Query() query: Record<string, string>,
    @Req() req: Request & { user?: UserAccessContext },
  ) {
    const report = await this.report(query, req.user);
    const { detailedRows: _rows, ...result } = report;
    void _rows;
    return result;
  }
  @Get('export')
  async export(
    @Query() query: Record<string, string>,
    @Req() req: Request & { user?: UserAccessContext },
  ) {
    return (await this.report(query, req.user)).detailedRows;
  }
  private async report(
    query: Record<string, string>,
    actor?: UserAccessContext,
  ) {
    // Match the datasets required by the original screen, including wage settings.
    if (
      actor &&
      [
        'timesheets.read',
        'workers.read',
        'projects.read',
        'work-orders.read',
        'shifts.read',
        'company-settings.read',
      ].some((permission) => !actor.permissions.includes(permission))
    )
      throw new ForbiddenException(
        'Payroll report requires access to its source datasets.',
      );
    const page = pageNumber(query.page, 1, 10000000);
    const rangeMode = catalogText(query.rangeMode) || 'all';
    if (!['all', 'week', 'last_week', 'custom'].includes(rangeMode))
      throw new BadRequestException('Invalid payroll date range.');
    const date = (value: unknown, required = false) => {
      const text = catalogText(value, 10);
      if (
        (!text && required) ||
        (text &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(text) ||
            Number.isNaN(Date.parse(text + 'T12:00:00Z')) ||
            new Date(text + 'T12:00:00Z').toISOString().slice(0, 10) !== text))
      )
        throw new BadRequestException('Invalid payroll date.');
      return text;
    };
    const today = date(query.today, true),
      customStartDate = date(query.start),
      customEndDate = date(query.end);
    const projectFilter = catalogText(query.projectId, 64),
      workerFilter = catalogText(query.workerId, 64);
    await this.timesheets.prepareForRead();
    const [allBounds] = await this.dataSource.query<
      Array<{ allStart: string; allEnd: string }>
    >(
      "SELECT COALESCE(MIN(t.date)::text, '') AS \"allStart\", COALESCE(MAX(t.date)::text, '') AS \"allEnd\" FROM timesheets t JOIN work_orders wo ON wo.id = t.work_order_id AND wo.deleted_at IS NULL JOIN work_order_shifts s ON s.id = t.shift_id AND s.work_order_id = wo.id WHERE t.variant = 'internal' AND (s.pm_approved_at IS NOT NULL OR s.status = 'pm_approved')",
    );
    const anchor = new Date(today + 'T12:00:00Z');
    const weekStart = new Date(anchor);
    weekStart.setUTCDate(
      anchor.getUTCDate() -
        anchor.getUTCDay() -
        (rangeMode === 'last_week' ? 7 : 0),
    );
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    const start =
      rangeMode === 'custom'
        ? customStartDate
        : rangeMode === 'all'
          ? ''
          : weekStart.toISOString().slice(0, 10);
    const end =
      rangeMode === 'custom'
        ? customEndDate
        : rangeMode === 'all'
          ? ''
          : weekEnd.toISOString().slice(0, 10);
    // Project only payroll inputs: signatures, notes and full assignment payloads never cross this boundary.
    const rows: PayrollRow[] = await this.dataSource.query(
      `
      SELECT t.id, t.worker_id AS "workerId", t.project_id AS "projectId", t.work_order_id AS "workOrderId", t.shift_id AS "shiftId", t.variant, t.date::text AS date,
        t.clock_in AS "clockIn", t.clock_out AS "clockOut", t.regular_hours AS "regularHours", t.overtime_hours AS "overtimeHours", t.double_time_hours AS "doubleTimeHours", t.lunch_taken AS "lunchTaken",
        w.first_name AS "firstName", w.last_name AS "lastName", w.hourly_rate AS "hourlyRate", p.name AS "projectName", p.number AS "projectNumber", wo.order_number AS "orderNumber",
        s.date::text AS "shiftDate", s.shift_name AS "shiftName", s.shift_template_id AS "shiftTemplateId", s.start_time AS "startTime", s.default_role_start_time AS "defaultRoleStartTime",
        (SELECT r.start_time FROM work_order_shift_roles r JOIN work_order_shift_role_workers rw ON rw.role_id = r.id WHERE r.shift_id = s.id AND rw.worker_id = t.worker_id ORDER BY r.id LIMIT 1) AS "roleStartTime"
      FROM timesheets t JOIN work_orders wo ON wo.id = t.work_order_id AND wo.deleted_at IS NULL
      JOIN work_order_shifts s ON s.id = t.shift_id AND s.work_order_id = wo.id
      LEFT JOIN workers w ON w.id = t.worker_id LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.variant = 'internal' AND (s.pm_approved_at IS NOT NULL OR s.status = 'pm_approved') AND ($1::date IS NULL OR t.date >= $1::date) AND ($2::date IS NULL OR t.date <= $2::date) ORDER BY t.date DESC, t.id ASC`,
      [start || null, end || null],
    );
    const workers = new Map<string, PayrollInput['workers'][number]>(),
      projects = new Map<string, PayrollInput['projects'][number]>();
    const workOrders = new Map<string, PayrollInput['workOrders'][number]>(),
      shifts = new Map<string, Shift>();
    for (const row of rows) {
      if (row.firstName !== null)
        workers.set(row.workerId, {
          id: row.workerId,
          firstName: row.firstName,
          lastName: row.lastName || '',
          hourlyRate: row.hourlyRate || '0',
        });
      if (row.projectName !== null)
        projects.set(row.projectId, {
          id: row.projectId,
          name: row.projectName,
          number: row.projectNumber || '',
        });
      let order = workOrders.get(row.workOrderId);
      if (!order) {
        order = {
          id: row.workOrderId,
          orderNumber: row.orderNumber,
          shifts: [],
        };
        workOrders.set(row.workOrderId, order);
      }
      let shift = shifts.get(row.shiftId);
      if (!shift) {
        shift = {
          id: row.shiftId,
          date: row.shiftDate,
          shiftName: row.shiftName,
          shiftTemplateId: row.shiftTemplateId,
          startTime: row.startTime,
          defaultRoleStartTime: row.defaultRoleStartTime,
          status: 'pm_approved',
          roles: [],
        };
        shifts.set(row.shiftId, shift);
        order.shifts.push(shift);
      }
      shift.roles.push({
        startTime: row.roleStartTime,
        assignedWorkers: [row.workerId],
      });
    }
    const [settings, shiftCatalog] = await Promise.all([
      this.settings.findAll(),
      this.dataSource
        .getRepository(ShiftEntity)
        .find({ order: { createdAt: 'DESC' } }),
    ]);
    const report = calculatePayroll({
      allBounds,
      timesheets: rows,
      workers: [...workers.values()].sort(
        (a, b) =>
          a.firstName.localeCompare(b.firstName) ||
          a.lastName.localeCompare(b.lastName),
      ),
      projects: [...projects.values()].sort((a, b) =>
        (a.number || '').localeCompare(b.number || ''),
      ),
      workOrders: [...workOrders.values()],
      shiftCatalog,
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
      today,
      rangeMode,
      customStartDate,
      customEndDate,
      projectFilter,
      workerFilter,
      page,
      limit: pageNumber(query.limit, 7, 50),
    });
    // The sidebar needs only the labels for its three recent entries per worker.
    const recentIds = new Set(
      report.workerSummaries.flatMap((summary) =>
        summary.recentTimesheets.map((row) => row.workOrderId),
      ),
    );
    return {
      ...report,
      recentWorkOrders: [...workOrders.values()]
        .filter((order) => recentIds.has(order.id))
        .map(({ id, orderNumber }) => ({ id, orderNumber })),
    };
  }
}
