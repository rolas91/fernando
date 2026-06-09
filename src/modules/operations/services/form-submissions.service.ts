import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { basename, resolve } from 'path';
import { In, Repository } from 'typeorm';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { Incident } from '../../../entities/incident.entity';
import { Worker } from '../../../entities/worker.entity';
import type { UserAccessContext } from '../../access/ports/access.port';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateFormSubmissionDto } from '../dto/create-form-submission.dto';
import { UpdateFormSubmissionDto } from '../dto/update-form-submission.dto';
import { SpacesStorageService } from './spaces-storage.service';
import {
  normalizeTimesheetSubmissionRow,
  TimesheetsService,
} from './timesheets.service';
import {
  normalizeFormFields,
  normalizeSubmissionData,
  validateSubmissionAgainstFields,
} from '../utils/form-contract.util';
import { loadCommercialPdfLogoImage } from '../utils/commercial-pdf.util';

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

type PdfImage = {
  name: string;
  width: number;
  height: number;
  data: Buffer;
  filter?: 'DCTDecode' | 'FlateDecode';
};

function buildPdfContentPdf(content: string, images: PdfImage[] = []): Buffer {
  const objects: Array<string | Buffer> = [];
  const pageHeight = 792;
  const xObjectResources = images.length
    ? `/XObject << ${images.map((image, index) => `/${image.name} ${7 + index} 0 R`).join(' ')} >>`
    : '';

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> ${xObjectResources} >> /Contents 6 0 R >>`,
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  objects.push(`<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`);
  images.forEach((image) => {
    objects.push(
      Buffer.concat([
        Buffer.from(
          `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${image.filter || 'DCTDecode'} /Length ${image.data.length} >>\nstream\n`,
          'utf8',
        ),
        image.data,
        Buffer.from('\nendstream', 'utf8'),
      ]),
    );
  });

  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'utf8')];
  let length = parts[0].length;
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(length);
    const header = Buffer.from(`${index + 1} 0 obj\n`, 'utf8');
    const objectBody =
      typeof objects[index] === 'string'
        ? Buffer.from(objects[index] as string, 'utf8')
        : (objects[index] as Buffer);
    const footer = Buffer.from('\nendobj\n', 'utf8');
    parts.push(header, objectBody, footer);
    length += header.length + objectBody.length + footer.length;
  }

  const xrefOffset = length;
  let tail = `xref\n0 ${objects.length + 1}\n`;
  tail += '0000000000 65535 f \n';
  for (let index = 1; index < offsets.length; index += 1) {
    tail += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  tail += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  parts.push(Buffer.from(tail, 'utf8'));
  return Buffer.concat(parts);
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

function timesheetRowHasSupervisorRole(row: Record<string, unknown>) {
  const roleNames = [
    ...(Array.isArray(row.roleNames) ? row.roleNames : [row.roleNames]),
    row.roleName,
    row.employeeLabel,
  ];
  return roleNames.some(
    (roleName) =>
      typeof roleName === 'string' &&
      /\b(lead|foreman|supervisor|manager|superintendent)\b/i.test(roleName),
  );
}

function normalizedTemplateText(value: string | undefined) {
  return (value || '').trim().toLowerCase().replace(/[_\s-]+/g, ' ');
}

function isTimesheetTemplate(template: FormTemplate | null) {
  if (!template) return false;
  const category = normalizedTemplateText(template.category);
  const name = normalizedTemplateText(template.name);
  if (category.includes('work order') || category.includes('workorder')) return false;
  return category.includes('timesheet') || category.includes('time sheet') || name.includes('timesheet') || name.includes('time sheet');
}

function isViewerRole(actor?: UserAccessContext) {
  return (actor?.role || '').trim().toLowerCase() === 'viewer';
}

function canSubmitFinalMobileTimesheets(actor?: UserAccessContext) {
  const permissions = actor?.permissions ?? [];
  const role = (actor?.role || '').trim().toLowerCase();
  return (
    ['scheduler', 'manager', 'admin'].includes(role) ||
    permissions.includes('form-submissions.write') ||
    permissions.includes('timesheets.write') ||
    permissions.includes('work-orders.write') ||
    permissions.includes('mobile.work-orders.submit')
  );
}

type TimesheetScope = 'own' | 'all';

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

function numberField(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function yesNo(value: unknown): string {
  return value === true || value === 'true' || value === 'yes' ? 'Y' : 'N';
}

function isSignaturePath(value: unknown): value is {
  type: 'signature-path';
  width: number;
  height: number;
  strokes: Array<Array<{ x: number; y: number }>>;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'signature-path' &&
    Array.isArray((value as { strokes?: unknown }).strokes)
  );
}

function isSignatureImage(value: unknown): value is {
  type: 'signature-image';
  dataUrl: string;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'signature-image' &&
    typeof (value as { dataUrl?: unknown }).dataUrl === 'string'
  );
}

function jpegFromSignature(value: unknown) {
  if (!isSignatureImage(value)) return null;
  const match = /^data:image\/jpe?g;base64,(.+)$/i.exec(value.dataUrl);
  if (!match) return null;
  return Buffer.from(match[1], 'base64');
}

function jpegDimensions(data: Buffer): { width: number; height: number } | null {
  let offset = 2;
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;

  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    const length = data.readUInt16BE(offset + 2);
    if (length < 2) return null;

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      return {
        height: data.readUInt16BE(offset + 5),
        width: data.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }

  return null;
}

function pdfSignature(
  value: unknown,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!isSignaturePath(value)) return '';
  const sourceWidth = Number(value.width) || 1;
  const sourceHeight = Number(value.height) || 1;
  const pad = 4;
  const availableWidth = Math.max(1, width - pad * 2);
  const availableHeight = Math.max(1, height - pad * 2);
  const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = x + pad + (availableWidth - drawWidth) / 2;
  const offsetY = y + pad + (availableHeight - drawHeight) / 2;
  const ops: string[] = ['q', '0 0 0 RG', '0.55 w'];
  for (const stroke of value.strokes) {
    const points = stroke.filter(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
    );
    if (points.length < 2) continue;
    const first = points[0];
    ops.push(`${offsetX + first.x * scale} ${offsetY + drawHeight - first.y * scale} m`);
    for (const point of points.slice(1)) {
      ops.push(`${offsetX + point.x * scale} ${offsetY + drawHeight - point.y * scale} l`);
    }
    ops.push('S');
  }
  ops.push('Q');
  return ops.join('\n');
}

function pdfSignatureImage(
  image: PdfImage,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const imageRatio = image.width / image.height;
  const boxRatio = width / height;
  const drawWidth = imageRatio > boxRatio ? width : height * imageRatio;
  const drawHeight = imageRatio > boxRatio ? width / imageRatio : height;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  return `q ${drawWidth} 0 0 ${drawHeight} ${drawX} ${drawY} cm /${image.name} Do Q`;
}

function addSignatureImage(
  images: PdfImage[],
  value: unknown,
): PdfImage | null {
  const signatureImage = jpegFromSignature(value);
  if (!signatureImage) return null;
  const imageName = `Sig${images.length + 1}`;
  const dimensions = jpegDimensions(signatureImage);
  const image = {
    name: imageName,
    width: dimensions?.width ?? 900,
    height: dimensions?.height ?? 360,
    data: signatureImage,
  };
  images.push(image);
  return image;
}

function drawSignature(
  ops: string[],
  images: PdfImage[],
  value: unknown,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const image = addSignatureImage(images, value);
  if (image) {
    ops.push(pdfSignatureImage(image, x, y, width, height));
  } else {
    ops.push(pdfSignature(value, x, y, width, height));
  }
}

function findSignatureValue(
  data: Record<string, unknown>,
  template: FormTemplate | null,
  patterns: RegExp[],
) {
  const fields = template ? normalizeFormFields(template.fields) : [];
  for (const field of fields) {
    if (field.type !== 'signature') continue;
    const haystack = `${field.id} ${field.key ?? ''} ${field.label}`.toLowerCase();
    if (patterns.some((pattern) => pattern.test(haystack))) {
      const value = data[field.id] ?? (field.key ? data[field.key] : undefined);
      if (value) return value;
    }
  }
  for (const [key, value] of Object.entries(data)) {
    const haystack = key.toLowerCase();
    if (patterns.some((pattern) => pattern.test(haystack)) && value) return value;
  }
  return null;
}

function buildTimesheetPdf(
  submission: FormSubmission,
  template: FormTemplate | null,
): Buffer {
  const data = submission.data ?? {};
  const rows = findTimesheetRows(data);
  const submittedAt = submission.submittedAt
    ? new Date(submission.submittedAt)
    : new Date();
  const firstRow = rows[0] ?? {};
  const dateValue =
    fieldValue(data, ['work_date', 'workDate', 'date']) ||
    firstRow.shiftDate ||
    submittedAt.toISOString().slice(0, 10);
  const jobNumber =
    fieldValue(data, ['job_number', 'jobNumber', 'dr_traffic_job_number', 'drTrafficJobNumber']) ||
    firstRow.workOrderNumber ||
    submission.workOrderId;
  const jobName =
    fieldValue(data, ['job_name', 'jobName']) ||
    firstRow.workOrderTitle ||
    submission.workOrderId;
  const address = fieldValue(data, ['address', 'job_address', 'jobAddress']);
  const city = fieldValue(data, ['city']);
  const circleOne = fieldValue(data, ['circle_one', 'circleOne']);
  const notes = fieldValue(data, ['notes', 'employeeNote', 'description']);
  const yellow: [number, number, number] = [0.9, 0.82, 0.2];
  const lightYellow: [number, number, number] = [0.96, 0.91, 0.45];

  const ops: string[] = ['0.18 w', '0 0 0 RG'];
  const images: PdfImage[] = [];
  const logo = loadCommercialPdfLogoImage('Logo');
  if (logo) images.push(logo);
  const left = 30;
  const pageW = 552;
  const top = 750;

  if (logo) {
    ops.push('q 130 0 0 41 30 720 cm /Logo Do Q');
  } else {
    ops.push(pdfText('DR Traffic Control LLC', left, top, 13, 'F2'));
  }
  ops.push(pdfText(template?.name || 'Timesheet', 470, top, 9, 'F2'));

  const cell = (
    label: string,
    value: unknown,
    x: number,
    y: number,
    w: number,
    h: number,
    max = 28,
    fill?: [number, number, number],
  ) => {
    if (fill) ops.push(pdfFillRect(x, y - h, w, h, fill));
    ops.push(pdfRect(x, y - h, w, h));
    ops.push(pdfText(label, x + 3, y - 7, 5.8, 'F2'));
    ops.push(pdfText(fitText(value, max) || '-', x + 3, y - h + 5, 7.2));
  };

  let y = 728;
  cell('Date:', dateValue, left, y, 92, 24, 18, yellow);
  cell('Circle One:', circleOne || '', left + 92, y, 116, 24, 18, yellow);
  cell('Shift:', `${fitText(firstRow.startTime || '', 8)} - ${fitText(firstRow.endTime || '', 8)}`, left + 208, y, 105, 24, 24, yellow);
  cell('Lunch?', rows.some((row) => row.lunchTaken) ? 'Yes' : 'No', left + 313, y, 60, 24, 8, yellow);
  cell('Job Number:', jobNumber, left + 373, y, 92, 24, 18, yellow);
  cell('1st Job #', jobNumber, left + 465, y, 87, 24, 18, yellow);

  y -= 24;
  cell('Job Name', jobName, left, y, 240, 34, 42, yellow);
  cell('Description', fieldValue(data, ['description', 'description_of_work', 'descriptionOfWork']) || jobName, left + 240, y, 225, 34, 42, yellow);
  cell('Address / Weather / City', [address, city].filter(Boolean).join(' - '), left + 465, y, 87, 34, 18, yellow);

  y -= 42;
  ops.push(pdfFillRect(left, y - 16, pageW, 16, yellow));
  ops.push(pdfRect(left, y - 16, pageW, 16));
  ops.push(pdfText('Employees Name (Signature all boxes were filled & checked is accurate)', left + 92, y - 11, 7, 'F2'));
  y -= 16;

  const employeeRows = [...rows].slice(0, 10);
  while (employeeRows.length < 8) employeeRows.push({});
  const tableX = left;
  const cols = [
    { label: 'Employee', w: 98 },
    { label: 'Signature', w: 78 },
    { label: '1st Job #', w: 62 },
    { label: '2nd Job #', w: 62 },
    { label: '3rd Job #', w: 62 },
    { label: 'Total', w: 38 },
    { label: 'D/N', w: 36 },
    { label: 'Notes', w: 116 },
  ];
  let x = tableX;
  cols.forEach((col) => {
    ops.push(pdfFillRect(x, y - 15, col.w, 15, lightYellow));
    ops.push(pdfRect(x, y - 15, col.w, 15));
    ops.push(pdfText(col.label, x + 3, y - 10, 6.5, 'F2'));
    x += col.w;
  });
  y -= 15;

  let grandSt = 0;
  let grandOt = 0;
  let grandDt = 0;
  employeeRows.forEach((row, index) => {
    const st = row.workerId ? numberField(row.st ?? row.regularHours) : 0;
    const ot = row.workerId ? numberField(row.ot ?? row.overtimeHours) : 0;
    const dt = row.workerId ? numberField(row.dt ?? row.doubleTimeHours) : 0;
    const total = st + ot + dt;
    grandSt += st;
    grandOt += ot;
    grandDt += dt;
    const rowNotes = [
      row.lunchTaken === false && row.workerId ? 'No lunch' : '',
      row.lunchTaken === true && row.workerId ? 'Lunch taken' : '',
      row.employeeNote || row.notes || notes || '',
    ]
      .filter(Boolean)
      .join(' / ');
    const values = [
      fitText(row.workerName || row.name || row.workerId || '', 24),
      isSignaturePath(row.signature) || isSignatureImage(row.signature) ? '' : row.signature ? 'Captured' : '',
      '',
      fitText(row.secondJobHours || '', 10),
      fitText(row.thirdJobHours || '', 10),
      row.workerId ? fitText(total, 5) : '',
      fitText(row.dayOrNight || row.dayNight || row.shiftPeriod || '', 4),
      fitText(rowNotes, 24),
    ];
    const rowH = 38;
    let colX = tableX;
    cols.forEach((col, colIndex) => {
      if (colIndex === 0 && index % 2 === 1) {
        ops.push(pdfFillRect(colX, y - rowH, col.w, rowH, [0.98, 0.96, 0.78]));
      }
      ops.push(pdfRect(colX, y - rowH, col.w, rowH));
      ops.push(pdfText(values[colIndex], colX + 3, y - 13, colIndex < 2 ? 8 : 7));
      if (colIndex === 0 && row.workerId) {
        ops.push(pdfText(firstString(row.roleNames || row.employeeLabel || ''), colX + 3, y - 25, 6));
      }
      if (colIndex === 1 && row.signature) {
        drawSignature(ops, images, row.signature, colX + 2, y - rowH + 1, col.w - 4, rowH - 2);
      }
      if (colIndex === 2 && row.workerId) {
        ops.push(pdfText(`ST ${fitText(st, 5)}`, colX + 5, y - 11, 7, 'F2'));
        ops.push(pdfText(`OT ${fitText(ot, 5)}`, colX + 5, y - 22, 7, 'F2'));
        ops.push(pdfText(`DT ${fitText(dt, 5)}`, colX + 5, y - 33, 7, 'F2'));
      }
      colX += col.w;
    });
    y -= rowH;
  });

  const grandTotal = grandSt + grandOt + grandDt;
  let totalX = tableX;
  [
    { text: 'Hours Worked', w: 176 },
    { text: `ST ${fitText(grandSt, 5)}  OT ${fitText(grandOt, 5)}  DT ${fitText(grandDt, 5)}`, w: 62 },
    { text: '', w: 62 },
    { text: '', w: 62 },
    { text: fitText(grandTotal, 6), w: 38 },
    { text: 'TOTAL', w: 36 },
    { text: '', w: 116 },
  ].forEach((cellInfo) => {
    ops.push(pdfFillRect(totalX, y - 18, cellInfo.w, 18, yellow));
    ops.push(pdfRect(totalX, y - 18, cellInfo.w, 18));
    ops.push(pdfText(cellInfo.text, totalX + 4, y - 12, 7, 'F2'));
    totalX += cellInfo.w;
  });
  y -= 34;

  ops.push(pdfRect(left, y - 48, pageW, 48));
  ops.push(pdfText('Comments / Materials / Notes', left + 4, y - 10, 7, 'F2'));
  wrapText(stringifyFieldValue(notes), 95)
    .slice(0, 3)
    .forEach((line, lineIndex) => {
      ops.push(pdfText(line, left + 4, y - 23 - lineIndex * 10, 8));
    });
  y -= 62;

  const employeeForemanSignature = findSignatureValue(data, template, [
    /employee[_\s-]*foreman/,
    /employee.*foreman/,
    /foreman.*signature/,
    /employee.*signature/,
    /worker.*signature/,
    /dr.?traffic/,
    /rep/,
  ]);
  const customerApprovalSignature = findSignatureValue(data, template, [
    /customer[_\s-]*approval/,
    /customer.*approval/,
    /customer.*signature/,
    /contract.*signature/,
    /contractor.*signature/,
    /owner.*signature/,
    /general.*contractor/,
    /approval/,
  ]);

  ops.push(pdfText('I certify the above hours are accurate.', left, y, 7));
  ops.push(pdfLine(left, y - 14, left + 190, y - 14));
  ops.push(pdfText('Employee / Foreman Signature', left, y - 24, 6, 'F2'));
  ops.push(pdfLine(left + 270, y - 14, left + 520, y - 14));
  ops.push(pdfText('Customer Contract / Approval', left + 270, y - 24, 6, 'F2'));
  if (employeeForemanSignature) {
    drawSignature(ops, images, employeeForemanSignature, left + 4, y - 12, 178, 25);
  }
  if (customerApprovalSignature) {
    drawSignature(ops, images, customerApprovalSignature, left + 274, y - 12, 238, 25);
  }
  ops.push(pdfText(`Submission ${compactId(submission.id, 24)}`, left, 28, 6));

  return buildPdfContentPdf(ops.join('\n'), images);
}

function buildWorkOrderPdf(
  submission: FormSubmission,
  template: FormTemplate | null,
): Buffer {
  const data = submission.data ?? {};
  const rows = findTimesheetRows(data);
  const images: PdfImage[] = [];
  const logo = loadCommercialPdfLogoImage('Logo');
  if (logo) images.push(logo);
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
    ...(logo ? ['q 130 0 0 41 45 719 cm /Logo Do Q'] : []),
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
        if (row.workerId && row.signature) {
          if (isSignaturePath(row.signature) || isSignatureImage(row.signature)) {
            drawSignature(ops, images, row.signature, colX + 58, top - rowH + 3, colW - 62, rowH - 6);
          } else {
            ops.push(pdfText('Sign: Captured', colX + 3, top - 18, 6));
          }
        } else {
          ops.push(pdfText(row.workerId ? 'Sign:' : '', colX + 3, top - 18, 6));
        }
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

  const foremanSignature = findSignatureValue(data, template, [
    /foreman/,
    /employee/,
    /dr.?traffic/,
    /rep/,
  ]);
  const customerSignature = findSignatureValue(data, template, [
    /customer/,
    /contract/,
    /owner/,
    /general/,
    /approval/,
  ]);

  ops.push(pdfText('DR TRAFFIC REP. (NAME)', left, 62, 7, 'F2'));
  ops.push(pdfLine(left + 105, 60, left + 245, 60));
  ops.push(pdfText('OWNER / GENERAL CONTRACTOR REP. (NAME)', left + 282, 62, 7, 'F2'));
  ops.push(pdfLine(left + 448, 60, left + 564, 60));
  if (foremanSignature) {
    drawSignature(ops, images, foremanSignature, left + 107, 62, 136, 30);
  }
  if (customerSignature) {
    drawSignature(ops, images, customerSignature, left + 450, 62, 112, 30);
  }
  ops.push(
    pdfText(
      'I hereby acknowledge the satisfactory completion of the above described work.',
      left + 282,
      48,
      6,
    ),
  );
  ops.push(pdfText(template?.name || 'Work Order Form', left, 36, 6));

  return buildPdfContentPdf(ops.join('\n'), images);
}

@Injectable()
export class FormSubmissionsService {
  private readonly logger = new Logger(FormSubmissionsService.name);

  constructor(
    @InjectRepository(FormSubmission)
    private readonly repo: Repository<FormSubmission>,
    @InjectRepository(FormTemplate)
    private readonly templatesRepo: Repository<FormTemplate>,
    @InjectRepository(Incident)
    private readonly incidentsRepo: Repository<Incident>,
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
    timesheetScope?: TimesheetScope;
  }, actor?: UserAccessContext) {
    const projectId = filters?.projectId?.trim();
    const workOrderId = filters?.workOrderId?.trim();
    const templateId = filters?.templateId?.trim();
    const shiftId = filters?.shiftId?.trim();
    const timesheetScope = filters?.timesheetScope;
    const hasFilters = Boolean(projectId || workOrderId || templateId || shiftId);
    const filterForActor = async (rows: FormSubmission[]) =>
      this.filterSubmissionsForActor(rows, actor, timesheetScope);
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
        { mobileRole: this.mobileValidationRole(template, actor) },
      );
    }

    const isSelfTimesheet = await this.isMobileSelfTimesheetSubmission(template, actor, data);
    const saved = await this.repo.save(
      this.repo.create({
        ...dto,
        workerId: isSelfTimesheet && actor ? await this.resolveWorkerIdForActor(actor) : dto.workerId,
        data,
        submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : undefined,
      }),
    );
    await this.syncTimesheetsFromSubmission(saved);
    await this.syncIncidentFromSubmission(saved, template);
    saved.pdfUrl = await this.generatePdf(saved, template);
    await this.repo.save(saved);
    this.realtime.emitTableUpdated('form_submissions');
    return saved;
  }

  async update(id: string, dto: UpdateFormSubmissionDto, actor?: UserAccessContext) {
    const item = await this.findOne(id);
    const previousPdfUrl = item.pdfUrl;
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
        { mobileRole: this.mobileValidationRole(template, actor) },
      );
    }

    const isSelfTimesheet = await this.isMobileSelfTimesheetSubmission(template, actor, data);
    Object.assign(item, {
      ...dto,
      workerId: isSelfTimesheet && actor ? await this.resolveWorkerIdForActor(actor) : dto.workerId ?? item.workerId,
      data,
      submittedAt:
        dto.submittedAt !== undefined ? new Date(dto.submittedAt) : undefined,
    });
    const saved = await this.repo.save(item);
    await this.syncTimesheetsFromSubmission(saved);
    await this.syncIncidentFromSubmission(saved, template);
    await this.deleteGeneratedPdf(previousPdfUrl);
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
    if (!(await this.isMobileSelfTimesheetSubmission(template, actor, normalized))) return normalized;

    const workerId = await this.resolveWorkerIdForActor(actor);
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(normalized)) {
      if (Array.isArray(value) && value.some(isTimesheetRowLike)) {
        next[key] = value
          .filter((row) => isTimesheetRowLike(row) && row.workerId === workerId)
          .map((row) => normalizeTimesheetSubmissionRow(row));
      } else {
        next[key] = value;
      }
    }
    return next;
  }

  private isMobileTimesheetRequest(
    template: FormTemplate | null,
    actor?: UserAccessContext,
  ) {
    return (
      Boolean(actor) &&
      isTimesheetTemplate(template) &&
      actor?.permissions.includes('mobile.timesheets.submit') &&
      !actor?.permissions.includes('form-submissions.write')
    );
  }

  private async isMobileSelfTimesheetSubmission(
    template: FormTemplate | null,
    actor?: UserAccessContext,
    data?: Record<string, unknown>,
  ) {
    if (!this.isMobileTimesheetRequest(template, actor)) return false;
    if (!isViewerRole(actor)) return false;
    if (canSubmitFinalMobileTimesheets(actor)) return false;
    const workerId = await this.resolveWorkerIdForActor(actor);
    const rows = findTimesheetRows(data ?? {});
    const actorRows = workerId
      ? rows.filter((row) => row.workerId === workerId)
      : [];
    const rowsToInspect = actorRows.length > 0 ? actorRows : rows;
    return !rowsToInspect.some(timesheetRowHasSupervisorRole);
  }

  private mobileValidationRole(
    template: FormTemplate | null,
    actor?: UserAccessContext,
  ) {
    return this.isMobileTimesheetRequest(template, actor) ? actor?.role : undefined;
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

  private isIncidentSubmission(template: FormTemplate | null) {
    const category = (template?.category || '').toLowerCase();
    const name = (template?.name || '').toLowerCase();
    return category.includes('incident') || name.includes('incident');
  }

  private dataString(data: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = data[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    }
    return '';
  }

  private dataDate(data: Record<string, unknown>, keys: string[], fallback?: Date | null) {
    const raw = this.dataString(data, keys);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (fallback instanceof Date && !Number.isNaN(fallback.getTime())) {
      return fallback.toISOString().slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
  }

  private normalizeIncidentSeverity(value: string) {
    const key = value.trim().toLowerCase();
    if (['low', 'medium', 'high', 'critical'].includes(key)) return key;
    return 'medium';
  }

  private async syncIncidentFromSubmission(
    submission: FormSubmission,
    template: FormTemplate | null,
  ) {
    if (!this.isIncidentSubmission(template)) return;
    if (submission.status !== 'submitted') return;

    const data = submission.data ?? {};
    const id = `inc_${submission.id}`.slice(0, 64);
    const existing = await this.incidentsRepo.findOne({ where: { id } });
    const incidentType = this.dataString(data, ['incident_type', 'incidentType', 'type']);
    const title =
      this.dataString(data, ['title', 'incident_title', 'incidentTitle']) ||
      (incidentType ? `${incidentType} Incident` : template?.name || 'Incident Report');
    const description = this.dataString(data, [
      'what_happened',
      'whatHappened',
      'description',
      'incident_description',
      'incidentDescription',
      'narrative',
    ]);
    const status =
      existing?.status ||
      this.dataString(data, ['incident_status', 'incidentStatus', 'status']).trim().toLowerCase() ||
      'open';

    const incident = this.incidentsRepo.create({
      ...(existing ?? {}),
      id,
      projectId: submission.projectId || existing?.projectId || '',
      reportedBy:
        submission.workerId ||
        this.dataString(data, ['reported_by', 'reportedBy', 'person_reporting', 'personReporting']) ||
        existing?.reportedBy ||
        '',
      date: this.dataDate(data, ['incident_date', 'incidentDate', 'report_date', 'reportDate'], submission.submittedAt),
      severity: this.normalizeIncidentSeverity(this.dataString(data, ['severity', 'severity_level', 'severityLevel'])),
      status,
      title: title.slice(0, 255),
      description,
      location: this.dataString(data, ['incident_location', 'incidentLocation', 'location']),
      actions: this.dataString(data, [
        'immediate_actions_taken',
        'immediateActionsTaken',
        'actions',
        'actions_taken',
        'actionsTaken',
      ]),
      photos: Array.isArray(data.photos_evidence)
        ? data.photos_evidence.map((item) => String(item)).filter(Boolean)
        : existing?.photos ?? [],
    });
    await this.incidentsRepo.save(incident);
    this.realtime.emitTableUpdated('incidents');
  }

  private async filterSubmissionsForActor(
    rows: FormSubmission[],
    actor?: UserAccessContext,
    timesheetScope?: TimesheetScope,
  ) {
    if (!actor) return rows;
    if (timesheetScope === 'all') return rows;
    if (canSubmitFinalMobileTimesheets(actor)) return rows;
    if (actor.permissions.includes('form-submissions.write')) return rows;
    if (!actor.permissions.includes('mobile.timesheets.submit')) return rows;
    if (actor.role !== 'viewer') return rows;

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

    return rows.filter((row) => {
      if (!timesheetTemplateIds.has(row.templateId)) return true;
      if (!workerId) return true;
      if (row.workerId) return row.workerId === workerId;
      const timesheetRows = findTimesheetRows(row.data ?? {});
      if (timesheetRows.length === 0) return true;
      return timesheetRows.some((timesheetRow) => timesheetRow.workerId === workerId);
    });
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    const removedTimesheetRows = findTimesheetRows(item.data ?? {});
    const incidentId = `inc_${item.id}`.slice(0, 64);
    await this.repo.remove(item);
    await this.reconcileTimesheetsAfterSubmissionRemoval(
      item,
      removedTimesheetRows,
    );
    await this.incidentsRepo.delete({ id: incidentId });
    await this.deleteGeneratedPdf(item.pdfUrl);
    this.realtime.emitTableUpdated('incidents');
    this.realtime.emitTableUpdated('form_submissions');
    return { success: true };
  }

  private async reconcileTimesheetsAfterSubmissionRemoval(
    removedSubmission: FormSubmission,
    removedRows: Array<Record<string, unknown>>,
  ) {
    if (removedRows.length === 0) return;

    const affectedKeys = new Set(
      removedRows
        .map((row) => this.timesheetRowKey(row, removedSubmission))
        .filter(Boolean),
    );
    if (affectedKeys.size === 0) return;

    const remainingSubmissions = await this.repo.find({
      where: {
        workOrderId: removedSubmission.workOrderId,
        shiftId: removedSubmission.shiftId,
      },
      order: { submittedAt: 'DESC' },
    });
    const replacementRowsByKey = new Map<string, Record<string, unknown>>();
    for (const submission of remainingSubmissions) {
      for (const row of findTimesheetRows(submission.data ?? {})) {
        const key = this.timesheetRowKey(row, submission);
        if (key && affectedKeys.has(key) && !replacementRowsByKey.has(key)) {
          replacementRowsByKey.set(key, row);
        }
      }
    }

    const rowsToDelete: Array<Record<string, unknown>> = [];
    const rowsToRestore: Array<Record<string, unknown>> = [];
    for (const row of removedRows) {
      const key = this.timesheetRowKey(row, removedSubmission);
      if (!key || !affectedKeys.has(key)) continue;
      const replacement = replacementRowsByKey.get(key);
      if (replacement) {
        rowsToRestore.push(replacement);
      } else {
        rowsToDelete.push(row);
      }
    }

    if (rowsToDelete.length > 0) {
      await this.timesheetsService.removeShiftWorkerRows(rowsToDelete, {
        workOrderId: removedSubmission.workOrderId,
        shiftId: removedSubmission.shiftId,
      });
    }
    if (rowsToRestore.length > 0) {
      await this.timesheetsService.upsertShiftRows(rowsToRestore, {
        workOrderId: removedSubmission.workOrderId,
        shiftId: removedSubmission.shiftId,
        projectId: removedSubmission.projectId,
      });
    }
  }

  private timesheetRowKey(
    row: Record<string, unknown>,
    submission: FormSubmission,
  ) {
    const workerId =
      typeof row.workerId === 'string' ? row.workerId.trim() : '';
    const workOrderId =
      typeof row.workOrderId === 'string' && row.workOrderId.trim()
        ? row.workOrderId.trim()
        : submission.workOrderId;
    const shiftId =
      typeof row.shiftId === 'string' && row.shiftId.trim()
        ? row.shiftId.trim()
        : submission.shiftId;
    return workerId && workOrderId && shiftId
      ? `${workOrderId}\u0000${shiftId}\u0000${workerId}`
      : '';
  }

  private async deleteGeneratedPdf(pdfUrl?: string | null) {
    const url = pdfUrl?.trim();
    if (!url) return;

    if (/^https?:\/\//i.test(url)) {
      if (!this.spacesStorage.isConfigured()) return;
      try {
        await this.spacesStorage.deletePublicFileByUrl(url);
      } catch (error) {
        this.logger.warn(
          `Could not delete generated submission PDF ${url}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return;
    }

    const prefix = '/files/generated-form-pdfs/';
    if (!url.startsWith(prefix)) return;
    const fileName = basename(url.slice(prefix.length));
    if (!fileName || fileName !== url.slice(prefix.length)) return;

    const publicDir = resolve(process.cwd(), 'public', 'generated-form-pdfs');
    try {
      await unlink(resolve(publicDir, fileName));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        this.logger.warn(
          `Could not delete generated submission PDF ${url}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
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
      category.includes('timesheet') || templateName.includes('timesheet')
        ? buildTimesheetPdf(submission, template)
        : category.includes('work order') || templateName.includes('work order')
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
