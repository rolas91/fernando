import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Timesheet } from '../../../entities/timesheet.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateTimesheetDto } from '../dto/create-timesheet.dto';
import { UpdateTimesheetDto } from '../dto/update-timesheet.dto';

@Injectable()
export class TimesheetsService {
  constructor(
    @InjectRepository(Timesheet)
    private readonly timesheetsRepo: Repository<Timesheet>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
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
      const status = stringValue(row.status) || existing?.status || 'pending';
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
        clockIn: stringValue(row.startTime) || stringValue(row.clockIn) || existing?.clockIn || '',
        clockOut: stringValue(row.endTime) || stringValue(row.clockOut) || existing?.clockOut || '',
        breakMinutes: numberValue(row.breakMinutes, existing?.breakMinutes ?? 0),
        regularHours: String(numberValue(row.st ?? row.regularHours, Number(existing?.regularHours ?? 0))),
        overtimeHours: String(numberValue(row.ot ?? row.overtimeHours, Number(existing?.overtimeHours ?? 0))),
        doubleTimeHours: String(numberValue(row.dt ?? row.doubleTimeHours, Number(existing?.doubleTimeHours ?? 0))),
        lunchTaken: booleanValue(row.lunchTaken, existing?.lunchTaken ?? false),
        employeeNote: stringValue(row.employeeNote) || existing?.employeeNote || '',
        signature: stringValue(row.signature) || existing?.signature || '',
        status:
          existing?.status === 'completed' && status === 'pending'
            ? 'completed'
            : status,
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
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function deterministicTimesheetId(workOrderId: string, shiftId: string, workerId: string): string {
  const safe = `${workOrderId}_${shiftId}_${workerId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `ts_${safe}`.slice(0, 64);
}
