import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdir, writeFile } from 'fs/promises';
import { basename, resolve } from 'path';
import { Repository } from 'typeorm';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateFormSubmissionDto } from '../dto/create-form-submission.dto';
import { UpdateFormSubmissionDto } from '../dto/update-form-submission.dto';
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

function buildSimplePdf(lines: string[]): Buffer {
  const objects: string[] = [];
  const pageHeight = 792;
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

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
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

@Injectable()
export class FormSubmissionsService {
  constructor(
    @InjectRepository(FormSubmission)
    private readonly repo: Repository<FormSubmission>,
    @InjectRepository(FormTemplate)
    private readonly templatesRepo: Repository<FormTemplate>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll(filters?: {
    projectId?: string;
    workOrderId?: string;
    templateId?: string;
  }) {
    const projectId = filters?.projectId?.trim();
    const workOrderId = filters?.workOrderId?.trim();
    const templateId = filters?.templateId?.trim();
    const hasFilters = Boolean(projectId || workOrderId || templateId);
    if (!hasFilters) {
      return this.repo.find({ order: { submittedAt: 'DESC' } });
    }
    return this.repo.find({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(workOrderId ? { workOrderId } : {}),
        ...(templateId ? { templateId } : {}),
      },
      order: { submittedAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Form submission ${id} not found`);
    return item;
  }

  async create(dto: CreateFormSubmissionDto) {
    const template = dto.templateId
      ? await this.templatesRepo.findOne({ where: { id: dto.templateId } })
      : null;

    if (template) {
      validateSubmissionAgainstFields(
        normalizeFormFields(template.fields),
        dto.data,
      );
    }

    const saved = await this.repo.save(
      this.repo.create({
        ...dto,
        data: normalizeSubmissionData(dto.data),
        submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : undefined,
      }),
    );
    saved.pdfUrl = await this.generatePdf(saved, template);
    await this.repo.save(saved);
    this.realtime.emitTableUpdated('form_submissions');
    return saved;
  }

  async update(id: string, dto: UpdateFormSubmissionDto) {
    const item = await this.findOne(id);
    const templateId = dto.templateId || item.templateId;
    const template = templateId
      ? await this.templatesRepo.findOne({ where: { id: templateId } })
      : null;

    if (template) {
      validateSubmissionAgainstFields(
        normalizeFormFields(template.fields),
        (dto.data as Record<string, unknown> | undefined) || item.data,
      );
    }

    Object.assign(item, {
      ...dto,
      data:
        dto.data !== undefined
          ? normalizeSubmissionData(dto.data as Record<string, unknown>)
          : item.data,
      submittedAt:
        dto.submittedAt !== undefined ? new Date(dto.submittedAt) : undefined,
    });
    const saved = await this.repo.save(item);
    saved.pdfUrl = await this.generatePdf(saved, template);
    await this.repo.save(saved);
    this.realtime.emitTableUpdated('form_submissions');
    return saved;
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

    const publicDir = resolve(process.cwd(), 'public', 'generated-form-pdfs');
    await mkdir(publicDir, { recursive: true });
    const safeId = basename(submission.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeId}.pdf`;
    await writeFile(resolve(publicDir, fileName), buildSimplePdf(lines.slice(0, 48)));
    return `/files/generated-form-pdfs/${fileName}`;
  }
}
