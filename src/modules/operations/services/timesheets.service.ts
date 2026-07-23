import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { CompanySettings } from '../../../entities/company-settings.entity';
import { Timesheet } from '../../../entities/timesheet.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { Shift as ShiftCatalog } from '../../../entities/shift.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { ShiftsQueryService } from './shifts-query.service';
import { CreateTimesheetDto } from '../dto/create-timesheet.dto';
import { UpdateTimesheetDto } from '../dto/update-timesheet.dto';

@Injectable()
export class TimesheetsService {
  constructor(
    @InjectRepository(Timesheet)
    private readonly timesheetsRepo: Repository<Timesheet>,
    @InjectRepository(FormSubmission)
    private readonly formSubmissionsRepo: Repository<FormSubmission>,
    @InjectRepository(FormTemplate)
    private readonly formTemplatesRepo: Repository<FormTemplate>,
    @InjectRepository(CompanySettings)
    private readonly companySettingsRepo: Repository<CompanySettings>,
    @InjectRepository(WorkOrder)
    private readonly workOrdersRepo: Repository<WorkOrder>,
    @InjectRepository(ShiftCatalog)
    private readonly shiftCatalogRepo: Repository<ShiftCatalog>,
    private readonly realtime: RealtimeGateway,
    private readonly shiftsQuery: ShiftsQueryService,
  ) {}

  async findAll() {
    await this.reconcileTimesheetSubmissions();
    return this.timesheetsRepo.find({ order: { date: 'DESC' } });
  }

  findForShift(workOrderId: string, shiftId: string) {
    return this.timesheetsRepo.find({
      where: { workOrderId, shiftId },
      order: { workerId: 'ASC' },
    });
  }

  async findOne(id: string) {
    const item = await this.timesheetsRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Timesheet ${id} not found`);
    return item;
  }

  create(dto: CreateTimesheetDto) {
    return this.timesheetsRepo
      .save(
        this.timesheetsRepo.create({
          ...dto,
          regularHours:
            dto.regularHours !== undefined
              ? String(dto.regularHours)
              : undefined,
          overtimeHours:
            dto.overtimeHours !== undefined
              ? String(dto.overtimeHours)
              : undefined,
          doubleTimeHours:
            dto.doubleTimeHours !== undefined
              ? String(dto.doubleTimeHours)
              : undefined,
        }),
      )
      .then((saved) => {
        this.realtime.emitTableUpdated('timesheets');
        return saved;
      });
  }

  async upsertShiftRows(
    rows: Array<Record<string, unknown>>,
    opts?: { workOrderId?: string; shiftId?: string; projectId?: string; emitRealtime?: boolean },
  ) {
    const saved: Timesheet[] = [];
    const calculationRules = await this.getCalculationRules();

    for (const row of rows) {
      const workerId = stringValue(row.workerId);
      const workOrderId = stringValue(row.workOrderId) || opts?.workOrderId || '';
      const shiftId = stringValue(row.shiftId) || opts?.shiftId || '';
      if (!workerId || !workOrderId || !shiftId) continue;

      const existing = await this.timesheetsRepo.findOne({
        where: { workOrderId, shiftId, workerId },
      });
      const status = operationalTimesheetStatus(row.status, existing?.status);
      const clockIn = stringValue(row.startTime) || stringValue(row.clockIn) || existing?.clockIn || '';
      const clockOut = stringValue(row.endTime) || stringValue(row.clockOut) || existing?.clockOut || '';
      const scheduledTimes = await this.getScheduledShiftTimes(
        workOrderId,
        shiftId,
        workerId,
      );
      validateTimesheetStartTime(
        clockIn,
        scheduledTimes.startTime,
        scheduledTimes.endTime,
      );
      const lunchTaken = booleanValue(row.lunchTaken, existing?.lunchTaken ?? false);
      const timesheetDate =
        stringValue(row.shiftDate) ||
        stringValue(row.date) ||
        existing?.date ||
        new Date().toISOString().slice(0, 10);
      const hours = calculateTimesheetHours(
        {
          startTime: clockIn,
          endTime: clockOut,
          scheduledStartTime: scheduledTimes.startTime,
          scheduledEndTime: scheduledTimes.endTime,
          date: timesheetDate,
          lunchTaken,
        },
        calculationRules,
      );
      const next = this.timesheetsRepo.create({
        ...(existing ?? {}),
        id:
          existing?.id ||
          deterministicTimesheetId(workOrderId, shiftId, workerId),
        workerId,
        projectId: stringValue(row.projectId) || opts?.projectId || existing?.projectId || '',
        workOrderId,
        shiftId,
        date: timesheetDate,
        clockIn,
        clockOut,
        breakMinutes: numberValue(row.breakMinutes, existing?.breakMinutes ?? 0),
        regularHours: String(hours.st),
        overtimeHours: String(hours.ot),
        doubleTimeHours: String(hours.dt),
        lunchTaken,
        employeeNote: stringValue(row.employeeNote) || existing?.employeeNote || '',
        signature: signatureValue(row.signature) || existing?.signature || '',
        status,
        approvedBy: existing?.approvedBy || '',
        rejectedReason: existing?.rejectedReason || '',
        notes: stringValue(row.notes) || existing?.notes || '',
      });
      if (existing && !hasTimesheetChanges(existing, next)) {
        continue;
      }
      saved.push(await this.timesheetsRepo.save(next));
    }

    if (saved.length > 0 && opts?.emitRealtime !== false) {
      this.realtime.emitTableUpdated('timesheets');
    }
    return saved;
  }

  async normalizeSubmissionRow(
    row: Record<string, unknown>,
    opts?: { workOrderId?: string; shiftId?: string },
  ) {
    const workOrderId = stringValue(row.workOrderId) || opts?.workOrderId || '';
    const shiftId = stringValue(row.shiftId) || opts?.shiftId || '';
    const workerId = stringValue(row.workerId);
    const scheduledTimes =
      (workOrderId && shiftId
        ? await this.getScheduledShiftTimes(workOrderId, shiftId, workerId)
        : { startTime: '', endTime: '' });
    const scheduledStartTime =
      scheduledTimes.startTime || stringValue(row.scheduledStartTime);
    const scheduledEndTime =
      scheduledTimes.endTime || stringValue(row.scheduledEndTime);
    const normalized = normalizeTimesheetSubmissionRow(
      { ...row, scheduledStartTime, scheduledEndTime },
      await this.getCalculationRules(),
    );
    validateTimesheetStartTime(
      stringValue(normalized.startTime),
      scheduledStartTime,
      scheduledEndTime,
    );
    return {
      ...normalized,
      scheduledStartTime,
      scheduledEndTime,
    };
  }

  private async getCalculationRules(): Promise<TimesheetCalculationRules> {
    const settings = await this.companySettingsRepo.findOne({
      where: { id: 'default' },
    });
    return timesheetCalculationRules(settings?.overtimeRules);
  }

  private async getScheduledShiftTimes(
    workOrderId: string,
    shiftId: string,
    workerId: string,
  ) {
    const shifts = await this.shiftsQuery.loadShiftsForWorkOrder(workOrderId);
    const shift = (shifts ?? []).find(
      (entry) => stringValue(entry.id) === shiftId,
    );
    const roles = Array.isArray(shift?.roles)
      ? (shift.roles as Record<string, unknown>[])
      : [];
    const role = roles.find((entry) => {
      const assignedWorkers = Array.isArray(entry.assignedWorkers)
        ? entry.assignedWorkers
        : [];
      return assignedWorkers.includes(workerId);
    });
    const shiftTemplateId = stringValue(shift?.shiftTemplateId);
    const startTime =
      stringValue(role?.startTime) ||
      stringValue(shift?.defaultRoleStartTime) ||
      stringValue(shift?.startTime);
    let shiftTemplate = shiftTemplateId
      ? await this.shiftCatalogRepo.findOne({ where: { id: shiftTemplateId } })
      : null;
    if (!shiftTemplate) {
      const targetStart = timeToMinutes(catalogClock(startTime));
      const activeTemplates = targetStart === null
        ? []
        : await this.shiftCatalogRepo.find({ where: { status: 'active' } });
      shiftTemplate =
        activeTemplates.find(
          (candidate) => timeToMinutes(candidate.startTime || '') === targetStart,
        ) ?? null;
    }
    const durationMinutes = shiftCatalogDurationMinutes(shiftTemplate);
    return {
      startTime,
      endTime:
        durationMinutes !== null
          ? addMinutesToClock(startTime, durationMinutes)
          : stringValue(shift?.endTime),
    };
  }

  async removeShiftWorkerRows(
    rows: Array<Record<string, unknown>>,
    opts?: { workOrderId?: string; shiftId?: string },
  ) {
    let removed = 0;

    for (const row of rows) {
      const workerId = stringValue(row.workerId);
      const workOrderId = stringValue(row.workOrderId) || opts?.workOrderId || '';
      const shiftId = stringValue(row.shiftId) || opts?.shiftId || '';
      if (!workerId || !workOrderId || !shiftId) continue;

      const result = await this.timesheetsRepo.delete({
        workerId,
        workOrderId,
        shiftId,
      });
      removed += result.affected ?? 0;
    }

    if (removed > 0) this.realtime.emitTableUpdated('timesheets');
    return { removed };
  }

  async update(id: string, dto: UpdateTimesheetDto) {
    const item = await this.findOne(id);
    Object.assign(item, {
      ...dto,
      regularHours:
        dto.regularHours !== undefined ? String(dto.regularHours) : undefined,
      overtimeHours:
        dto.overtimeHours !== undefined ? String(dto.overtimeHours) : undefined,
      doubleTimeHours:
        dto.doubleTimeHours !== undefined
          ? String(dto.doubleTimeHours)
          : undefined,
    });
    const saved = await this.timesheetsRepo.save(item);
    this.realtime.emitTableUpdated('timesheets');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.timesheetsRepo.remove(item);
    this.realtime.emitTableUpdated('timesheets');
    return { success: true };
  }

  private isTimesheetTemplate(template: FormTemplate) {
    return [template.category, template.name]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes('timesheet'));
  }

  private findTimesheetRows(data: Record<string, unknown>) {
    const rows: Record<string, unknown>[] = [];
    for (const value of Object.values(data)) {
      if (!Array.isArray(value)) continue;
      for (const entry of value) {
        if (
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as Record<string, unknown>).workerId === 'string'
        ) {
          rows.push(entry as Record<string, unknown>);
        }
      }
    }
    return rows;
  }

  private async reconcileTimesheetSubmissions() {
    const templates = await this.formTemplatesRepo.find();
    const templateIds = templates
      .filter((template) => this.isTimesheetTemplate(template))
      .map((template) => template.id);
    if (templateIds.length === 0) return;

    const submissions = await this.formSubmissionsRepo.find({
      where: { templateId: In(templateIds), status: 'submitted' },
      order: { submittedAt: 'ASC' },
    });
    for (const submission of submissions) {
      const rows = this.findTimesheetRows(submission.data ?? {});
      if (rows.length === 0) continue;
      try {
        await this.upsertShiftRows(rows, {
          workOrderId: submission.workOrderId,
          shiftId: submission.shiftId,
          projectId: submission.projectId,
          emitRealtime: false,
        });
      } catch (error) {
        console.warn(
          `Skipping timesheet submission reconciliation for ${submission.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function signatureValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'signature-image'
  ) {
    return JSON.stringify(value);
  }
  return '';
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numericEqual(a: unknown, b: unknown) {
  return numberValue(a) === numberValue(b);
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function hasTimesheetChanges(existing: Timesheet, next: Timesheet) {
  return (
    existing.workerId !== next.workerId ||
    existing.projectId !== next.projectId ||
    existing.workOrderId !== next.workOrderId ||
    existing.shiftId !== next.shiftId ||
    existing.date !== next.date ||
    existing.clockIn !== next.clockIn ||
    existing.clockOut !== next.clockOut ||
    existing.breakMinutes !== next.breakMinutes ||
    !numericEqual(existing.regularHours, next.regularHours) ||
    !numericEqual(existing.overtimeHours, next.overtimeHours) ||
    !numericEqual(existing.doubleTimeHours, next.doubleTimeHours) ||
    existing.lunchTaken !== next.lunchTaken ||
    existing.employeeNote !== next.employeeNote ||
    existing.signature !== next.signature ||
    existing.status !== next.status ||
    existing.approvedBy !== next.approvedBy ||
    existing.rejectedReason !== next.rejectedReason ||
    existing.notes !== next.notes
  );
}

function operationalTimesheetStatus(value: unknown, existingStatus?: string) {
  const incoming = stringValue(value).toLowerCase();
  const existing = stringValue(existingStatus).toLowerCase();
  const lockedStatuses = new Set(['approved', 'rejected']);
  if (lockedStatuses.has(existing) && (!incoming || incoming === 'completed' || incoming === 'submitted')) {
    return existing;
  }
  if (!incoming) return existing || 'pending';
  if (incoming === 'completed' || incoming === 'submitted' || incoming === 'done') {
    return 'completed';
  }
  return incoming;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function timeToMinutes(value: string) {
  const normalized = value.trim();
  const twelveHourMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i);
  if (twelveHourMatch) {
    let hours = Number(twelveHourMatch[1]);
    const minutes = Number(twelveHourMatch[2]);
    const period = twelveHourMatch[3].toUpperCase();
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
    if (period === 'A' && hours === 12) hours = 0;
    if (period === 'P' && hours !== 12) hours += 12;
    return hours * 60 + minutes;
  }

  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export type TimesheetCalculationRules = {
  regularHoursLimit: number;
  doubleTimeThreshold: number;
  noLunchCreditEnabled: boolean;
  noLunchCreditMinimumHours: number;
  noLunchCreditHours: number;
  noLunchCreditTarget: 'st' | 'ot';
  noLunchCreditEffectiveDate: string;
  yesLunchDeductionEnabled: boolean;
  yesLunchDeductionMinimumHours: number;
  yesLunchDeductionHours: number;
};

export function timesheetCalculationRules(
  rules?: Record<string, unknown> | null,
): TimesheetCalculationRules {
  return {
    regularHoursLimit: positiveNumber(rules?.regularHoursLimit, 8),
    doubleTimeThreshold: positiveNumber(rules?.doubleTimeThreshold, 12),
    noLunchCreditEnabled: booleanValue(rules?.noLunchCreditEnabled, true),
    noLunchCreditMinimumHours: nonNegativeNumber(
      rules?.noLunchCreditMinimumHours,
      7,
    ),
    noLunchCreditHours: nonNegativeNumber(rules?.noLunchCreditHours, 1),
    noLunchCreditTarget:
      stringValue(rules?.noLunchCreditTarget).toLowerCase() === 'ot'
        ? 'ot'
        : 'st',
    noLunchCreditEffectiveDate: stringValue(rules?.noLunchCreditEffectiveDate),
    yesLunchDeductionEnabled: booleanValue(rules?.yesLunchDeductionEnabled, false),
    yesLunchDeductionMinimumHours: nonNegativeNumber(
      rules?.yesLunchDeductionMinimumHours,
      0,
    ),
    yesLunchDeductionHours: nonNegativeNumber(rules?.yesLunchDeductionHours, 0),
  };
}

export function calculateTimesheetHours(row: {
  startTime?: string;
  endTime?: string;
  clockIn?: string;
  clockOut?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  date?: string;
  shiftDate?: string;
  lunchTaken?: boolean;
}, rules: TimesheetCalculationRules = timesheetCalculationRules()) {
  const startLabel = stringValue(row.startTime) || stringValue(row.clockIn);
  const endLabel = stringValue(row.endTime) || stringValue(row.clockOut);
  const timeline = timesheetTimeline(
    startLabel,
    endLabel,
    stringValue(row.scheduledStartTime),
    stringValue(row.scheduledEndTime),
  );
  const start = timeline.adjustedStart;
  const end = timeline.adjustedEnd;
  if (start === null || end === null) {
    throw new BadRequestException('Timesheet Start Time and End Time must use HH:mm format.');
  }
  if (end <= start) {
    throw new BadRequestException('Timesheet End Time must be greater than Start Time.');
  }

  const totalHours = (end - start) / 60;
  const lunchDeduction =
    rules.yesLunchDeductionEnabled &&
    row.lunchTaken === true &&
    totalHours > rules.yesLunchDeductionMinimumHours
      ? rules.yesLunchDeductionHours
      : 0;
  const payableHours = Math.max(0, totalHours - lunchDeduction);
  const regularLimit = rules.regularHoursLimit;
  const doubleTimeThreshold = Math.max(rules.doubleTimeThreshold, regularLimit);
  const dt = Math.max(0, payableHours - doubleTimeThreshold);
  const ot = Math.max(0, Math.min(payableHours, doubleTimeThreshold) - regularLimit);
  const lunchCredit =
    rules.noLunchCreditEnabled &&
    row.lunchTaken === false &&
    totalHours > rules.noLunchCreditMinimumHours
      ? rules.noLunchCreditHours
      : 0;
  const target = noLunchCreditTargetForDate(
    stringValue(row.date) || stringValue(row.shiftDate),
    rules,
  );
  const st = Math.min(payableHours, regularLimit) + (target === 'st' ? lunchCredit : 0);
  const creditedOt = ot + (target === 'ot' ? lunchCredit : 0);

  return {
    st: roundHours(st),
    ot: roundHours(creditedOt),
    dt: roundHours(dt),
    total: roundHours(st + creditedOt + dt),
  };
}

export function validateTimesheetStartTime(
  startTime: string,
  scheduledStartTime: string,
  scheduledEndTime = '',
) {
  if (!scheduledStartTime) return;
  const timeline = timesheetTimeline(
    startTime,
    scheduledEndTime || startTime,
    scheduledStartTime,
    scheduledEndTime,
  );
  const start = timeline.adjustedStart;
  const scheduledStart = timeline.scheduledStart;
  if (start === null || scheduledStart === null) {
    throw new BadRequestException(
      'Timesheet Start Time and scheduled shift start must use HH:mm format.',
    );
  }
  if (start < scheduledStart) {
    throw new BadRequestException(
      `Timesheet Start Time cannot be earlier than the scheduled shift start (${scheduledStartTime}).`,
    );
  }
}

export function normalizeTimesheetSubmissionRow(
  row: Record<string, unknown>,
  rules: TimesheetCalculationRules = timesheetCalculationRules(),
) {
  const clockIn = stringValue(row.startTime) || stringValue(row.clockIn);
  const clockOut = stringValue(row.endTime) || stringValue(row.clockOut);
  const lunchTaken = booleanValue(row.lunchTaken, false);
  const hours = calculateTimesheetHours(
    {
      startTime: clockIn,
      endTime: clockOut,
      scheduledStartTime: stringValue(row.scheduledStartTime),
      scheduledEndTime: stringValue(row.scheduledEndTime),
      date: stringValue(row.shiftDate) || stringValue(row.date),
      lunchTaken,
    },
    rules,
  );
  return {
    ...row,
    startTime: clockIn,
    endTime: clockOut,
    st: hours.st,
    ot: hours.ot,
    dt: hours.dt,
    total: hours.total,
    lunchTaken,
  };
}

function noLunchCreditTargetForDate(
  rowDate: string,
  rules: TimesheetCalculationRules,
): 'st' | 'ot' {
  if (rules.noLunchCreditTarget !== 'ot') return 'st';
  if (!rules.noLunchCreditEffectiveDate) return 'st';
  const effectiveDate = rules.noLunchCreditEffectiveDate.slice(0, 10);
  const normalizedRowDate = rowDate.slice(0, 10);
  return normalizedRowDate && normalizedRowDate >= effectiveDate ? 'ot' : 'st';
}

function timesheetTimeline(
  startTime: string,
  endTime: string,
  scheduledStartTime: string,
  scheduledEndTime: string,
) {
  const rawStart = timeToMinutes(startTime);
  const rawEnd = timeToMinutes(endTime);
  const scheduledStart = timeToMinutes(scheduledStartTime);
  const scheduledEnd = timeToMinutes(scheduledEndTime);
  const overnightShift =
    scheduledStart !== null &&
    scheduledEnd !== null &&
    scheduledEnd <= scheduledStart;
  let adjustedStart = rawStart;
  let adjustedEnd = rawEnd;
  if (
    overnightShift &&
    adjustedStart !== null &&
    scheduledEnd !== null &&
    adjustedStart <= scheduledEnd
  ) {
    adjustedStart += 24 * 60;
  }
  if (
    overnightShift &&
    adjustedEnd !== null &&
    adjustedStart !== null &&
    adjustedEnd <= adjustedStart
  ) {
    adjustedEnd += 24 * 60;
  }
  return { adjustedStart, adjustedEnd, scheduledStart };
}

function addMinutesToClock(value: string, minutesToAdd: number) {
  const start = timeToMinutes(value);
  if (start === null) return '';
  const normalized = (start + minutesToAdd) % (24 * 60);
  const hours = String(Math.floor(normalized / 60)).padStart(2, '0');
  const minutes = String(normalized % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function catalogClock(value: string) {
  const minutes = timeToMinutes(value);
  if (minutes === null) return '';
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const remainder = String(minutes % 60).padStart(2, '0');
  return `${hours}:${remainder}`;
}

function shiftCatalogDurationMinutes(template: ShiftCatalog | null) {
  const start = timeToMinutes(template?.startTime || '');
  const end = timeToMinutes(template?.endTime || '');
  if (start !== null && end !== null) {
    const difference = end - start;
    return difference > 0 ? difference : difference + 24 * 60;
  }
  if (template?.durationHours && template.durationHours > 0) {
    return template.durationHours * 60;
  }
  return null;
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function deterministicTimesheetId(workOrderId: string, shiftId: string, workerId: string): string {
  const safe = `${workOrderId}_${shiftId}_${workerId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `ts_${safe}`.slice(0, 64);
}
