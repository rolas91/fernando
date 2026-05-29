import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { Timesheet } from '../../../entities/timesheet.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
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
    private readonly realtime: RealtimeGateway,
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
    opts?: { workOrderId?: string; shiftId?: string; projectId?: string },
  ) {
    const saved: Timesheet[] = [];

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
      const lunchTaken = booleanValue(row.lunchTaken, existing?.lunchTaken ?? false);
      const hours = calculateTimesheetHours({ startTime: clockIn, endTime: clockOut, lunchTaken });
      const next = this.timesheetsRepo.create({
        ...(existing ?? {}),
        id:
          existing?.id ||
          deterministicTimesheetId(workOrderId, shiftId, workerId),
        workerId,
        projectId: stringValue(row.projectId) || opts?.projectId || existing?.projectId || '',
        workOrderId,
        shiftId,
        date: stringValue(row.shiftDate) || stringValue(row.date) || existing?.date || new Date().toISOString().slice(0, 10),
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
      saved.push(await this.timesheetsRepo.save(next));
    }

    if (saved.length > 0) this.realtime.emitTableUpdated('timesheets');
    return saved;
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
      await this.upsertShiftRows(rows, {
        workOrderId: submission.workOrderId,
        shiftId: submission.shiftId,
        projectId: submission.projectId,
      });
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

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
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
    return 'pending';
  }
  return incoming;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function timeToMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function calculateTimesheetHours(row: {
  startTime?: string;
  endTime?: string;
  clockIn?: string;
  clockOut?: string;
  lunchTaken?: boolean;
}) {
  const startLabel = stringValue(row.startTime) || stringValue(row.clockIn);
  const endLabel = stringValue(row.endTime) || stringValue(row.clockOut);
  const start = timeToMinutes(startLabel);
  const end = timeToMinutes(endLabel);
  if (start === null || end === null) {
    throw new BadRequestException('Timesheet Start Time and End Time must use HH:mm format.');
  }
  if (end <= start) {
    throw new BadRequestException('Timesheet End Time must be greater than Start Time.');
  }

  const totalHours = (end - start) / 60;
  const regularLimit = 8;
  const doubleTimeThreshold = 12;
  const dt = Math.max(0, totalHours - doubleTimeThreshold);
  const ot = Math.max(0, Math.min(totalHours, doubleTimeThreshold) - regularLimit);
  const st = Math.min(totalHours, regularLimit) + (row.lunchTaken === false ? 1 : 0);

  return {
    st: roundHours(st),
    ot: roundHours(ot),
    dt: roundHours(dt),
    total: roundHours(st + ot + dt),
  };
}

export function normalizeTimesheetSubmissionRow(row: Record<string, unknown>) {
  const clockIn = stringValue(row.startTime) || stringValue(row.clockIn);
  const clockOut = stringValue(row.endTime) || stringValue(row.clockOut);
  const lunchTaken = booleanValue(row.lunchTaken, false);
  const hours = calculateTimesheetHours({ startTime: clockIn, endTime: clockOut, lunchTaken });
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

function deterministicTimesheetId(workOrderId: string, shiftId: string, workerId: string): string {
  const safe = `${workOrderId}_${shiftId}_${workerId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `ts_${safe}`.slice(0, 64);
}
