import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdir, writeFile } from 'fs/promises';
import { basename, resolve } from 'path';
import { In, Repository } from 'typeorm';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { Worker } from '../../../entities/worker.entity';
import type { UserAccessContext } from '../../access/ports/access.port';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateFormSubmissionDto } from '../dto/create-form-submission.dto';
import { UpdateFormSubmissionDto } from '../dto/update-form-submission.dto';
import { SpacesStorageService } from './spaces-storage.service';
import { TimesheetsService } from './timesheets.service';
import {
  normalizeFormFields,
  normalizeSubmissionData,
  validateSubmissionAgainstFields,
} from '../utils/form-contract.util';

function pdfEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?');
}

function stringifyFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) {
    return value.map((entry) => stringifyFieldValue(entry)).join(', ');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const label =
      record.name ?? record.fileName ?? record.url ?? record.uri ?? record.path;
    if (typeof label === 'string' && label.trim()) return label.trim();
    return JSON.stringify(value);
  }
  return String(value);
}

function wrapText(value: string, maxLength = 88): string[] {
  const words = value.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length <= maxLength) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ['-'];
}

function buildPdfContentPdf(content: string): Buffer {
  const objects: string[] = [];
  const pageHeight = 792;

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  objects.push(`<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`);

  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'utf8');
}

function buildSimplePdf(lines: string[]): Buffer {
  const content = [
    'BT',
    '/F1 11 Tf',
    '50 742 Td',
    '14 TL',
    ...lines.map((line, index) =>
      index === 0
        ? `(${pdfEscape(line)}) Tj`
        : `T* (${pdfEscape(line)}) Tj`,
    ),
    'ET',
  ].join('\n');
  return buildPdfContentPdf(content);
}

function pdfText(
  value: string,
  x: number,
  y: number,
  size = 8,
  font: 'F1' | 'F2' = 'F1',
) {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`;
}

function pdfLine(x1: number, y1: number, x2: number, y2: number) {
  return `${x1} ${y1} m ${x2} ${y2} l S`;
}

function pdfRect(x: number, y: number, width: number, height: number) {
  return `${x} ${y} ${width} ${height} re S`;
}

function pdfFillRect(
  x: number,
  y: number,
  width: number,
  height: number,
  color: [number, number, number],
) {
  return `q ${color.join(' ')} rg ${x} ${y} ${width} ${height} re f Q`;
}

function fitText(value: unknown, max = 34): string {
  const text = stringifyFieldValue(value).replace(/\s+/g, ' ').trim();
  if (text === '-') return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function compactId(value: unknown, max = 18): string {
  const text = fitText(value, max).replace(/^fs_mobile_?/i, '');
  return text || '-';
}

function fieldValue(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      return data[key];
    }
  }
  return '';
}

function findTimesheetRows(data: Record<string, unknown>) {
  for (const value of Object.values(data)) {
    if (!Array.isArray(value)) continue;
    const rows = value.filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).workerId === 'string',
    );
    if (rows.length) return rows;
  }
  return [];
}

function isTimesheetRowLike(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).workerId === 'string'
  );
}

function firstString(value: unknown): string {
  if (Array.isArray(value)) return fitText(value[0], 14);
  return fitText(value, 14);
}

function buildWorkOrderPdf(
  submission: FormSubmission,
  template: FormTemplate | null,
): Buffer {
  const data = submission.data ?? {};
  const rows = findTimesheetRows(data);
  const submittedAt = submission.submittedAt
    ? new Date(submission.submittedAt)
    : new Date();
  const dateValue =
    fieldValue(data, ['work_date', 'workDate', 'date']) ||
    submittedAt.toISOString().slice(0, 10);
  const jobNumber = fieldValue(data, ['dr_traffic_job_number', 'drTrafficJobNumber']);
  const jobName = fieldValue(data, ['job_name', 'jobName']);
  const description = fieldValue(data, ['description_of_work', 'descriptionOfWork']);
  const client = fieldValue(data, ['client']);
  const contact = fieldValue(data, ['contact']);
  const shift = fieldValue(data, ['work_shift', 'workShift']);
  const equipmentId = fieldValue(data, ['equipment_id', 'equipmentId']);
  const equipmentHours = fieldValue(data, ['equipment_hours', 'equipmentHours']);
  const notes = fieldValue(data, ['notes', 'extra_work_details', 'extraWorkDetails']);
  const displayNumber = jobNumber || submission.workOrderId || compactId(submission.id, 16);

  const ops: string[] = [
    '0.18 w',
    '0 0 0 RG',
    pdfFillRect(45, 716, 44, 44, [0.82, 0, 0]),
    pdfFillRect(52, 724, 30, 7, [1, 1, 1]),
    pdfFillRect(52, 738, 30, 7, [1, 1, 1]),
    pdfText('DR', 101, 731, 36, 'F2'),
    pdfText('TRAFFIC CONTROL', 102, 719, 9, 'F2'),
    pdfText('WORK ORDER', 350, 736, 16, 'F2'),
    '0.82 0 0 rg',
    pdfText(`No. ${compactId(displayNumber, 18)}`, 472, 736, 12, 'F2'),
    '0 0 0 rg',
    '0.82 0 0 rg',
    pdfText('DR Traffic Control, LLC', 228, 690, 15, 'F2'),
    '0 0 0 rg',
    pdfText('2285 Revere Ave, San Francisco, CA 94124, USA', 214, 675, 8),
    pdfText('CSLB #1099211        www.drtrafficcontrol.com', 217, 663, 8),
    pdfText('Phone: 415-441-4410     info@drtrafficcontrol.com', 210, 651, 8),
  ];

  const left = 24;
  const width = 564;
  let top = 626;
  const cell = (
    label: string,
    value: unknown,
    x: number,
    y: number,
    w: number,
    h: number,
    max = 42,
  ) => {
    ops.push(pdfRect(x, y - h, w, h));
    ops.push(pdfText(label, x + 3, y - 7, 5.5, 'F2'));
    ops.push(pdfText(fitText(value, max) || '-', x + 3, y - h + 5, 7));
  };

  cell('DR TRAFFIC JOB#', jobNumber || submission.projectId || '-', left, top, 198, 21, 24);
  cell('JOB NAME:', jobName || submission.workOrderId || '-', left + 198, top, 198, 21, 38);
  cell('DATE:', dateValue, left + 396, top, 168, 21, 20);
  top -= 21;
  cell('DESCRIPTION OF WORK:', description, left, top, width, 26, 104);
  top -= 26;
  cell('CLIENT:', client, left, top, 337, 21, 48);
  cell('CUSTOMER ORDER #:', compactId(submission.workOrderId, 26), left + 337, top, 227, 21, 32);
  top -= 21;
  cell('CONTACT:', contact || submission.workerId || '-', left, top, 337, 21, 48);
  cell('WORK SHIFT:', shift || '-', left + 337, top, 227, 21, 28);
  top -= 21;

  ops.push(pdfRect(left, top - 20, width, 20));
  ops.push(pdfText('FIELD SERVICE  [ ]', left + 55, top - 13, 8, 'F2'));
  ops.push(pdfText('INTERNAL SALE  [ ]', left + 180, top - 13, 8, 'F2'));
  ops.push(pdfText('SALES  [ ]', left + 320, top - 13, 8, 'F2'));
  ops.push(pdfText('ON RENT  [ ]', left + 430, top - 13, 8, 'F2'));
  top -= 20;

  const laborX = left;
  const laborW = 345;
  const equipX = left + laborW;
  const equipW = width - laborW;
  ops.push(pdfFillRect(laborX, top - 16, laborW, 16, [0.94, 0.36, 0.36]));
  ops.push(pdfFillRect(equipX, top - 16, equipW, 16, [0.94, 0.36, 0.36]));
  ops.push(pdfRect(laborX, top - 16, laborW, 16));
  ops.push(pdfRect(equipX, top - 16, equipW, 16));
  ops.push(pdfText('LABOR', laborX + 150, top - 11, 8, 'F2'));
  ops.push(pdfText('EQUIPMENT', equipX + 78, top - 11, 8, 'F2'));
  top -= 16;

  const laborCols = [150, 40, 34, 34, 34, 34, 19];
  const headers = ['EMPLOYEE NAME', 'SHIFT', 'START', 'END', 'REG', 'OT', 'DT'];
  let x = laborX;
  headers.forEach((header, index) => {
    ops.push(pdfRect(x, top - 15, laborCols[index], 15));
    ops.push(pdfText(header, x + 3, top - 10, 6, 'F2'));
    x += laborCols[index];
  });
  ops.push(pdfRect(equipX, top - 15, 62, 15));
  ops.push(pdfText('EQUIP ID', equipX + 4, top - 10, 6, 'F2'));
  ops.push(pdfRect(equipX + 62, top - 15, 122, 15));
  ops.push(pdfText('EQUIP DESCRIPTION', equipX + 66, top - 10, 6, 'F2'));
  ops.push(pdfRect(equipX + 184, top - 15, 35, 15));
  ops.push(pdfText('HRS', equipX + 190, top - 10, 6, 'F2'));
  top -= 15;

  const laborRows = [...rows].slice(0, 6);
  while (laborRows.length < 7) laborRows.push({});
  laborRows.forEach((row, index) => {
    const rowH = 22;
    const values = [
      fitText(row.workerName || row.name || '', 26) || '',
      firstString(row.roleNames || row.employeeLabel || shift || ''),
      fitText(row.startTime || '', 6),
      fitText(row.endTime || '', 6),
      row.workerId ? fitText(row.st ?? 0, 5) : '',
      row.workerId ? fitText(row.ot ?? 0, 5) : '',
      row.workerId ? fitText(row.dt ?? 0, 5) : '',
    ];
    let colX = laborX;
    laborCols.forEach((colW, colIndex) => {
      ops.push(pdfRect(colX, top - rowH, colW, rowH));
      ops.push(pdfText(values[colIndex], colX + 3, top - 9, 7));
      if (colIndex === 0) {
        ops.push(pdfText(row.workerId ? `Sign: ${row.signature ? 'Captured' : ''}` : '', colX + 3, top - 18, 6));
      }
      colX += colW;
    });
    ops.push(pdfRect(equipX, top - rowH, 62, rowH));
    ops.push(pdfText(index === 0 ? fitText(equipmentId, 14) : '', equipX + 4, top - 12, 7));
    ops.push(pdfRect(equipX + 62, top - rowH, 122, rowH));
    ops.push(pdfText(index === 0 ? 'Assigned equipment' : '', equipX + 66, top - 12, 7));
    ops.push(pdfRect(equipX + 184, top - rowH, 35, rowH));
    ops.push(pdfText(index === 0 ? fitText(equipmentHours, 5) : '', equipX + 190, top - 12, 7));
    top -= rowH;
  });

  ops.push(pdfFillRect(left, top - 16, 282, 16, [0.94, 0.36, 0.36]));
  ops.push(pdfFillRect(left + 282, top - 16, 282, 16, [0.94, 0.36, 0.36]));
  ops.push(pdfRect(left, top - 16, 282, 16));
  ops.push(pdfRect(left + 282, top - 16, 282, 16));
  ops.push(pdfText('MATERIAL', left + 122, top - 11, 8, 'F2'));
  ops.push(pdfText('NOTES', left + 410, top - 11, 8, 'F2'));
  top -= 16;

  const materialRows = [
    'CONES:',
    'STANDS - LIGHT / HEAVY DUTY:',
    'TYPE 1 BARRICADES:',
    'TYPE 3 BARRICADES:',
    'VINYL SIGNS:',
    'ALUMINUM SIGNS:',
    'TEMP TAPE:',
  ];
  materialRows.forEach((label, index) => {
    ops.push(pdfRect(left, top - 18, 150, 18));
    ops.push(pdfText(label, left + 3, top - 11, 6));
    ops.push(pdfRect(left + 150, top - 18, 50, 18));
    ops.push(pdfText(index === 6 ? `4" / 8"` : '', left + 158, top - 11, 6));
    ops.push(pdfRect(left + 200, top - 18, 40, 18));
    ops.push(pdfRect(left + 240, top - 18, 42, 18));
    ops.push(pdfRect(left + 282, top - 18, 282, 18));
    if (index === 0) {
      wrapText(stringifyFieldValue(notes), 54)
        .slice(0, 3)
        .forEach((line, lineIndex) => {
          ops.push(pdfText(line, left + 287, top - 10 - lineIndex * 6, 6));
        });
    }
    top -= 18;
  });

  ops.push(pdfText('DR TRAFFIC REP. (NAME)', left, 62, 7, 'F2'));
  ops.push(pdfLine(left + 105, 60, left + 245, 60));
  ops.push(pdfText('OWNER / GENERAL CONTRACTOR REP. (NAME)', left + 282, 62, 7, 'F2'));
  ops.push(pdfLine(left + 448, 60, left + 564, 60));
  ops.push(
    pdfText(
      'I hereby acknowledge the satisfactory completion of the above described work.',
      left + 282,
      48,
      6,
    ),
  );
  ops.push(pdfText(template?.name || 'Work Order Form', left, 36, 6));

  return buildPdfContentPdf(ops.join('\n'));
}

@Injectable()
export class FormSubmissionsService {
  constructor(
    @InjectRepository(FormSubmission)
    private readonly repo: Repository<FormSubmission>,
    @InjectRepository(FormTemplate)
    private readonly templatesRepo: Repository<FormTemplate>,
    @InjectRepository(Worker)
    private readonly workersRepo: Repository<Worker>,
    private readonly realtime: RealtimeGateway,
    private readonly spacesStorage: SpacesStorageService,
    private readonly timesheetsService: TimesheetsService,
  ) {}

  findAll(filters?: {
    projectId?: string;
    workOrderId?: string;
    templateId?: string;
    shiftId?: string;
  }, actor?: UserAccessContext) {
    const projectId = filters?.projectId?.trim();
    const workOrderId = filters?.workOrderId?.trim();
    const templateId = filters?.templateId?.trim();
    const shiftId = filters?.shiftId?.trim();
    const hasFilters = Boolean(projectId || workOrderId || templateId || shiftId);
    const filterForActor = async (rows: FormSubmission[]) =>
      this.filterSubmissionsForActor(rows, actor);
    if (!hasFilters) {
      return this.repo
        .find({ order: { submittedAt: 'DESC' } })
        .then(filterForActor);
    }
    return this.repo
      .find({
        where: {
          ...(projectId ? { projectId } : {}),
          ...(workOrderId ? { workOrderId } : {}),
          ...(templateId ? { templateId } : {}),
          ...(shiftId ? { shiftId } : {}),
        },
        order: { submittedAt: 'DESC' },
      })
      .then(filterForActor);
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Form submission ${id} not found`);
    return item;
  }

  async create(dto: CreateFormSubmissionDto, actor?: UserAccessContext) {
    const template = dto.templateId
      ? await this.templatesRepo.findOne({ where: { id: dto.templateId } })
      : null;
    const data = await this.prepareTimesheetData(
      normalizeSubmissionData(dto.data),
      template,
      actor,
    );

    if (template) {
      validateSubmissionAgainstFields(
        normalizeFormFields(template.fields),
        data,
      );
    }

    const saved = await this.repo.save(
      this.repo.create({
        ...dto,
        workerId:
          this.isMobileTimesheetSubmission(template, actor) && actor
            ? await this.resolveWorkerIdForActor(actor)
            : dto.workerId,
        data,
        submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : undefined,
      }),
    );
    await this.syncTimesheetsFromSubmission(saved);
    saved.pdfUrl = await this.generatePdf(saved, template);
    await this.repo.save(saved);
    this.realtime.emitTableUpdated('form_submissions');
    return saved;
  }

  async update(id: string, dto: UpdateFormSubmissionDto, actor?: UserAccessContext) {
    const item = await this.findOne(id);
    const templateId = dto.templateId || item.templateId;
    const template = templateId
      ? await this.templatesRepo.findOne({ where: { id: templateId } })
      : null;
    const data =
      dto.data !== undefined
        ? await this.prepareTimesheetData(
            normalizeSubmissionData(dto.data as Record<string, unknown>),
            template,
            actor,
          )
        : item.data;

    if (template) {
      validateSubmissionAgainstFields(
        normalizeFormFields(template.fields),
        data,
      );
    }

    Object.assign(item, {
      ...dto,
      workerId:
        this.isMobileTimesheetSubmission(template, actor) && actor
          ? await this.resolveWorkerIdForActor(actor)
          : dto.workerId ?? item.workerId,
      data,
      submittedAt:
        dto.submittedAt !== undefined ? new Date(dto.submittedAt) : undefined,
    });
    const saved = await this.repo.save(item);
    await this.syncTimesheetsFromSubmission(saved);
    saved.pdfUrl = await this.generatePdf(saved, template);
    await this.repo.save(saved);
    this.realtime.emitTableUpdated('form_submissions');
    return saved;
  }

  private async prepareTimesheetData(
    data: Record<string, unknown> | undefined,
    template: FormTemplate | null,
    actor?: UserAccessContext,
  ) {
    const normalized = normalizeSubmissionData(data);
    if (!this.isMobileTimesheetSubmission(template, actor)) return normalized;

    const workerId = await this.resolveWorkerIdForActor(actor);
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(normalized)) {
      if (Array.isArray(value) && value.some(isTimesheetRowLike)) {
        next[key] = value.filter(
          (row) => isTimesheetRowLike(row) && row.workerId === workerId,
        );
      } else {
        next[key] = value;
      }
    }
    return next;
  }

  private isMobileTimesheetSubmission(
    template: FormTemplate | null,
    actor?: UserAccessContext,
  ) {
    const category = (template?.category || '').toLowerCase();
    return (
      Boolean(actor) &&
      category.includes('timesheet') &&
      actor?.permissions.includes('mobile.timesheets.submit') &&
      !actor?.permissions.includes('form-submissions.write')
    );
  }

  private async resolveWorkerIdForActor(actor?: UserAccessContext) {
    const email = actor?.email?.trim().toLowerCase();
    if (!email) return '';
    const worker = await this.workersRepo.findOne({ where: { email } });
    return worker?.id || actor?.id || '';
  }

  private async syncTimesheetsFromSubmission(submission: FormSubmission) {
    const data = submission.data ?? {};
    const rows = findTimesheetRows(data);
    if (rows.length === 0) return;
    await this.timesheetsService.upsertShiftRows(rows, {
      workOrderId: submission.workOrderId,
      shiftId: submission.shiftId,
      projectId: submission.projectId,
    });
  }

  private async filterSubmissionsForActor(
    rows: FormSubmission[],
    actor?: UserAccessContext,
  ) {
    if (!actor) return rows;
    if (actor.permissions.includes('form-submissions.write')) return rows;
    if (!actor.permissions.includes('mobile.timesheets.submit')) return rows;

    const workerId = await this.resolveWorkerIdForActor(actor);
    const templateIds = [...new Set(rows.map((row) => row.templateId).filter(Boolean))];
    const templates =
      templateIds.length > 0
        ? await this.templatesRepo.find({ where: { id: In(templateIds) } })
        : [];
    const timesheetTemplateIds = new Set(
      templates
        .filter((template) => (template.category || '').toLowerCase().includes('timesheet'))
        .map((template) => template.id),
    );

    return rows.filter(
      (row) =>
        timesheetTemplateIds.has(row.templateId) &&
        (!workerId || !row.workerId || row.workerId === workerId),
    );
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('form_submissions');
    return { success: true };
  }

  private async generatePdf(
    submission: FormSubmission,
    template: FormTemplate | null,
  ): Promise<string> {
    const fields = template ? normalizeFormFields(template.fields) : [];
    const data = submission.data ?? {};
    const category = (template?.category || '').toLowerCase();
    const templateName = (template?.name || '').toLowerCase();
    const lines: string[] = [
      template?.name || `Form submission ${submission.id}`,
      '',
      `Submission ID: ${submission.id}`,
      `Status: ${submission.status}`,
      `Submitted at: ${
        submission.submittedAt
          ? new Date(submission.submittedAt).toISOString()
          : new Date().toISOString()
      }`,
      `Assignment: ${submission.workOrderId || '-'}`,
      `Shift: ${submission.shiftId || '-'}`,
      `Project: ${submission.projectId || '-'}`,
      `Worker: ${submission.workerId || '-'}`,
      '',
      'Responses',
      '---------',
    ];

    if (fields.length === 0) {
      for (const [key, value] of Object.entries(data)) {
        if (key === '_meta') continue;
        for (const line of wrapText(`${key}: ${stringifyFieldValue(value)}`)) {
          lines.push(line);
        }
      }
    } else {
      for (const field of fields) {
        const value = data[field.id] ?? data[field.label];
        const label = `${field.label}${field.required ? ' *' : ''}`;
        for (const line of wrapText(`${label}: ${stringifyFieldValue(value)}`)) {
          lines.push(line);
        }
      }
    }

    const safeId = basename(submission.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeId}.pdf`;
    const pdf =
      category.includes('work order') || templateName.includes('work order')
        ? buildWorkOrderPdf(submission, template)
        : buildSimplePdf(lines.slice(0, 48));

    if (this.spacesStorage.isConfigured()) {
      const [uploaded] = await this.spacesStorage.uploadWorkOrderFiles(
        [
          {
            originalname: fileName,
            mimetype: 'application/pdf',
            buffer: pdf,
            size: pdf.length,
          },
        ],
        submission.workOrderId || submission.id,
      );
      if (uploaded?.url) return uploaded.url;
    }

    const publicDir = resolve(process.cwd(), 'public', 'generated-form-pdfs');
    await mkdir(publicDir, { recursive: true });
    await writeFile(resolve(publicDir, fileName), pdf);
    return `/files/generated-form-pdfs/${fileName}`;
  }
}
