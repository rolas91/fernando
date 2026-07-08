import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { basename, resolve } from 'path';
import { deflateSync, inflateSync } from 'zlib';
import { In, Repository } from 'typeorm';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { Incident } from '../../../entities/incident.entity';
import { Client } from '../../../entities/client.entity';
import { Equipment } from '../../../entities/equipment.entity';
import { Material } from '../../../entities/material.entity';
import { Project } from '../../../entities/project.entity';
import { Timesheet } from '../../../entities/timesheet.entity';
import { Worker } from '../../../entities/worker.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import type { UserAccessContext } from '../../access/ports/access.port';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateFormSubmissionDto } from '../dto/create-form-submission.dto';
import { UpdateFormSubmissionDto } from '../dto/update-form-submission.dto';
import { SpacesStorageService } from './spaces-storage.service';
import { TimesheetsService } from './timesheets.service';
import { ShiftsQueryService } from './shifts-query.service';
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
  objects.push(
    `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
  );
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
      index === 0 ? `(${pdfEscape(line)}) Tj` : `T* (${pdfEscape(line)}) Tj`,
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

function findResourceRows(
  data: Record<string, unknown>,
  idKey: 'equipmentId' | 'materialId',
): Array<Record<string, unknown>> {
  for (const value of Object.values(data)) {
    if (!Array.isArray(value)) continue;
    const rows = value.filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as Record<string, unknown>)[idKey] === 'string',
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
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, ' ');
}

function isTimesheetTemplate(template: FormTemplate | null) {
  if (!template) return false;
  const category = normalizedTemplateText(template.category);
  const name = normalizedTemplateText(template.name);
  if (category.includes('work order') || category.includes('workorder'))
    return false;
  return (
    category.includes('timesheet') ||
    category.includes('time sheet') ||
    name.includes('timesheet') ||
    name.includes('time sheet')
  );
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

export function shouldGenerateSubmissionPdf(
  template: FormTemplate | null,
  _actor?: UserAccessContext,
) {
  return !isTimesheetTemplate(template);
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

function pngFromSignature(value: unknown) {
  if (!isSignatureImage(value)) return null;
  const match = /^data:image\/png;base64,(.+)$/i.exec(value.dataUrl);
  if (!match) return null;
  return Buffer.from(match[1], 'base64');
}

function paethPredictor(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function pdfImageFromPng(data: Buffer, name: string): PdfImage | null {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (data.length < 33 || !data.subarray(0, 8).equals(signature)) return null;

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('ascii', offset + 4, offset + 8);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR' && chunk.length >= 13) {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
      interlace = chunk[12];
    } else if (type === 'IDAT') {
      idat.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  const channelCount = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (
    !width ||
    !height ||
    bitDepth !== 8 ||
    interlace !== 0 ||
    channelCount === 0 ||
    idat.length === 0
  ) {
    return null;
  }

  const decoded = inflateSync(Buffer.concat(idat));
  const stride = width * channelCount;
  const expectedLength = height * (stride + 1);
  if (decoded.length < expectedLength) return null;
  const scanlines = Buffer.alloc(height * stride);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = decoded[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * stride;
    const previousOffset = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = decoded[sourceOffset + x];
      const left =
        x >= channelCount ? scanlines[rowOffset + x - channelCount] : 0;
      const up = y > 0 ? scanlines[previousOffset + x] : 0;
      const upperLeft =
        y > 0 && x >= channelCount
          ? scanlines[previousOffset + x - channelCount]
          : 0;
      const reconstructed =
        filter === 0
          ? raw
          : filter === 1
            ? raw + left
            : filter === 2
              ? raw + up
              : filter === 3
                ? raw + Math.floor((left + up) / 2)
                : filter === 4
                  ? raw + paethPredictor(left, up, upperLeft)
                  : raw;
      scanlines[rowOffset + x] = reconstructed & 0xff;
    }
    sourceOffset += stride;
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * channelCount;
      const alpha = channelCount === 4 ? scanlines[source + 3] : 255;
      const isVisible =
        alpha > 12 &&
        (scanlines[source] < 245 ||
          scanlines[source + 1] < 245 ||
          scanlines[source + 2] < 245);
      if (!isVisible) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const cropPadding = 4;
  const cropLeft = maxX >= 0 ? Math.max(0, minX - cropPadding) : 0;
  const cropTop = maxY >= 0 ? Math.max(0, minY - cropPadding) : 0;
  const cropRight = maxX >= 0 ? Math.min(width - 1, maxX + cropPadding) : width - 1;
  const cropBottom = maxY >= 0 ? Math.min(height - 1, maxY + cropPadding) : height - 1;
  const croppedWidth = cropRight - cropLeft + 1;
  const croppedHeight = cropBottom - cropTop + 1;
  const rgb = Buffer.alloc(croppedWidth * croppedHeight * 3);
  for (let y = 0; y < croppedHeight; y += 1) {
    for (let x = 0; x < croppedWidth; x += 1) {
      const source =
        ((cropTop + y) * width + cropLeft + x) * channelCount;
      const target = (y * croppedWidth + x) * 3;
      const alpha = channelCount === 4 ? scanlines[source + 3] / 255 : 1;
      rgb[target] = Math.round(
        scanlines[source] * alpha + 255 * (1 - alpha),
      );
      rgb[target + 1] = Math.round(
        scanlines[source + 1] * alpha + 255 * (1 - alpha),
      );
      rgb[target + 2] = Math.round(
        scanlines[source + 2] * alpha + 255 * (1 - alpha),
      );
    }
  }
  return {
    name,
    width: croppedWidth,
    height: croppedHeight,
    data: deflateSync(rgb),
    filter: 'FlateDecode',
  };
}

function jpegDimensions(
  data: Buffer,
): { width: number; height: number } | null {
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
  contentScale = 1,
) {
  if (!isSignaturePath(value)) return '';
  const allPoints = value.strokes.flat().filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
  );
  if (allPoints.length < 2) return '';
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  const sourceWidth = Math.max(1, maxX - minX);
  const sourceHeight = Math.max(1, maxY - minY);
  const scaleFactor = Math.max(0.1, Math.min(1, contentScale));
  const availableWidth = Math.max(1, width * scaleFactor);
  const availableHeight = Math.max(1, height * scaleFactor);
  const scale = Math.min(
    availableWidth / sourceWidth,
    availableHeight / sourceHeight,
  );
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = x + (width - drawWidth) / 2;
  const offsetY = y + (height - drawHeight) / 2;
  const ops: string[] = ['q', '0 0 0 RG', '0.55 w'];
  for (const stroke of value.strokes) {
    const points = stroke.filter(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
    );
    if (points.length < 2) continue;
    const first = points[0];
    ops.push(
      `${offsetX + (first.x - minX) * scale} ${offsetY + drawHeight - (first.y - minY) * scale} m`,
    );
    for (const point of points.slice(1)) {
      ops.push(
        `${offsetX + (point.x - minX) * scale} ${offsetY + drawHeight - (point.y - minY) * scale} l`,
      );
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
  contentScale = 1,
) {
  const scaleFactor = Math.max(0.1, Math.min(1, contentScale));
  const scaledWidth = width * scaleFactor;
  const scaledHeight = height * scaleFactor;
  const scaledX = x + (width - scaledWidth) / 2;
  const scaledY = y + (height - scaledHeight) / 2;
  const imageRatio = image.width / image.height;
  const boxRatio = scaledWidth / scaledHeight;
  const drawWidth =
    imageRatio > boxRatio ? scaledWidth : scaledHeight * imageRatio;
  const drawHeight =
    imageRatio > boxRatio ? scaledWidth / imageRatio : scaledHeight;
  const drawX = scaledX + (scaledWidth - drawWidth) / 2;
  const drawY = scaledY + (scaledHeight - drawHeight) / 2;
  return `q ${drawWidth} 0 0 ${drawHeight} ${drawX} ${drawY} cm /${image.name} Do Q`;
}

function addSignatureImage(
  images: PdfImage[],
  value: unknown,
): PdfImage | null {
  const signatureImage = jpegFromSignature(value);
  const imageName = `Sig${images.length + 1}`;
  const pngImage = pngFromSignature(value);
  if (pngImage) {
    const image = pdfImageFromPng(pngImage, imageName);
    if (image) images.push(image);
    return image;
  }
  if (!signatureImage) return null;
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
  contentScale = 1,
) {
  const image = addSignatureImage(images, value);
  if (image) {
    ops.push(pdfSignatureImage(image, x, y, width, height, contentScale));
  } else {
    ops.push(pdfSignature(value, x, y, width, height, contentScale));
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
    const haystack =
      `${field.id} ${field.key ?? ''} ${field.label}`.toLowerCase();
    if (patterns.some((pattern) => pattern.test(haystack))) {
      const value = data[field.id] ?? (field.key ? data[field.key] : undefined);
      if (value) return value;
    }
  }
  for (const [key, value] of Object.entries(data)) {
    const haystack = key.toLowerCase();
    if (patterns.some((pattern) => pattern.test(haystack)) && value)
      return value;
  }
  return null;
}

type WorkOrderPdfWorker = {
  workerId: string;
  workerName: string;
  roleName: string;
  startTime: string;
  endTime: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  lunchTaken: boolean;
  breakMinutes: number;
  signature: unknown;
};

type WorkOrderPdfResource = {
  identifier: string;
  description: string;
  hours?: string;
  size?: string;
  quantity?: string;
  price?: string;
};

type WorkOrderPdfContext = {
  workOrder?: WorkOrder | null;
  project?: Project | null;
  client?: Client | null;
  workers: WorkOrderPdfWorker[];
  equipment: WorkOrderPdfResource[];
  materials: WorkOrderPdfResource[];
  shift?: Record<string, unknown> | null;
};

function normalizeResourceIdentifier(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function splitResourceSummary(value: unknown): WorkOrderPdfResource[] {
  const text = stringifyFieldValue(value).trim();
  if (!text || text === '-') return [];

  return text
    .split(/\r?\n|;|,(?=\s*[A-Za-z0-9_-]+\s*(?:[-–—:]|$))/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(.+?)\s*(?:[-–—:])\s*(.+)$/.exec(part);
      if (!match) {
        return {
          identifier: part,
          description: part,
        };
      }
      return {
        identifier: match[1].trim(),
        description: match[2].trim(),
      };
    });
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseStoredJson(value: string | null | undefined): unknown {
  if (!value) return '';
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function formatPdfClock(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/[ap]\.?m\.?$/i.test(text)) return text.toUpperCase().replace(/\./g, '');
  const match = /^(\d{1,2}):(\d{2})/.exec(text);
  if (!match) return text;
  let hour = Number(match[1]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return text;
  const period = hour >= 12 ? 'PM' : 'AM';
  if (hour === 0) hour = 12;
  if (hour > 12) hour -= 12;
  return `${hour}:${match[2]} ${period}`;
}

function pdfCheckbox(
  ops: string[],
  label: string,
  checked: boolean,
  x: number,
  y: number,
  size = 6,
) {
  ops.push(pdfText(label, x, y, size, 'F2'));
  const boxX = x + Math.max(24, label.length * (size * 0.55)) + 3;
  ops.push(pdfRect(boxX, y - 1, 5, 5));
  if (checked) {
    ops.push(pdfLine(boxX + 1, y + 1, boxX + 2.2, y - 0.2));
    ops.push(pdfLine(boxX + 2.2, y - 0.2, boxX + 4.4, y + 3.4));
  }
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
    fieldValue(data, [
      'job_number',
      'jobNumber',
      'dr_traffic_job_number',
      'drTrafficJobNumber',
    ]) ||
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

  const dayNames = ['Sun', 'M', 'T', 'W', 'Th', 'F', 'Sat'];
  const dayIndex = new Date(`${dateValue}T12:00:00`).getDay();
  const circleDay = circleOne || dayNames[dayIndex];

  let y = 728;
  cell('Date:', dateValue, left, y, 92, 24, 18, yellow);

  // Circle One - day of week with checkbox
  ops.push(pdfFillRect(left + 92, y - 24, 116, 24, yellow));
  ops.push(pdfRect(left + 92, y - 24, 116, 24));
  ops.push(pdfText('Circle One:', left + 95, y - 7, 5.8, 'F2'));
  const dayOpts = ['M', 'T', 'W', 'Th', 'F', 'Sat', 'Sun'];
  dayOpts.forEach((d, i) => {
    const dx = left + 105 + i * 14;
    const dy = y - 17;
    if (d === circleDay) {
      ops.push(`q 0 0 0 rg ${dx} ${dy - 4} 4 4 re f Q`);
    } else {
      ops.push(`q 0 0 0 RG ${dx} ${dy - 4} 4 4 re S Q`);
    }
    ops.push(pdfText(d, dx + 6, dy, 5.5));
  });

  // Shift with AM/PM checkbox
  ops.push(pdfFillRect(left + 208, y - 24, 105, 24, yellow));
  ops.push(pdfRect(left + 208, y - 24, 105, 24));
  ops.push(pdfText('Shift:', left + 211, y - 7, 5.8, 'F2'));
  const startTimeStr = String(firstRow.startTime || '');
  const startH = Number(startTimeStr.split(':')[0]);
  const isAm = startTimeStr.includes('AM') || (startH > 0 && startH < 12);
  const sx = left + 230;
  const sy = y - 17;
  if (isAm) {
    ops.push(`q 0 0 0 rg ${sx} ${sy - 4} 4 4 re f Q`);
  } else {
    ops.push(`q 0 0 0 RG ${sx} ${sy - 4} 4 4 re S Q`);
  }
  ops.push(pdfText('AM', sx + 6, sy, 5.5));
  if (!isAm) {
    ops.push(`q 0 0 0 rg ${sx + 22} ${sy - 4} 4 4 re f Q`);
  } else {
    ops.push(`q 0 0 0 RG ${sx + 22} ${sy - 4} 4 4 re S Q`);
  }
  ops.push(pdfText('PM', sx + 28, sy, 5.5));
  ops.push(
    pdfText(
      `${fitText(firstRow.startTime || '', 8)}-${fitText(firstRow.endTime || '', 8)}`,
      left + 215,
      y - 20,
      6,
    ),
  );

  // Lunch? with Yes/No checkbox
  ops.push(pdfFillRect(left + 313, y - 24, 60, 24, yellow));
  ops.push(pdfRect(left + 313, y - 24, 60, 24));
  ops.push(pdfText('Lunch?', left + 316, y - 7, 5.8, 'F2'));
  const anyLunch = rows.some((r) => r.lunchTaken);
  const lx = left + 325;
  const ly = y - 17;
  if (anyLunch) {
    ops.push(`q 0 0 0 rg ${lx} ${ly - 4} 4 4 re f Q`);
  } else {
    ops.push(`q 0 0 0 RG ${lx} ${ly - 4} 4 4 re S Q`);
  }
  ops.push(pdfText('Yes', lx + 6, ly, 5.5));
  if (!anyLunch) {
    ops.push(`q 0 0 0 rg ${lx + 28} ${ly - 4} 4 4 re f Q`);
  } else {
    ops.push(`q 0 0 0 RG ${lx + 28} ${ly - 4} 4 4 re S Q`);
  }
  ops.push(pdfText('No', lx + 34, ly, 5.5));

  cell('Job Number:', jobNumber, left + 373, y, 92, 24, 18, yellow);
  cell('1st Job #', jobNumber, left + 465, y, 87, 24, 18, yellow);

  y -= 24;
  cell('Job Name', jobName, left, y, 240, 34, 42, yellow);
  cell(
    'Description',
    fieldValue(data, [
      'description',
      'description_of_work',
      'descriptionOfWork',
    ]) || jobName,
    left + 240,
    y,
    225,
    34,
    42,
    yellow,
  );
  cell(
    'Address / Weather / City',
    [address, city].filter(Boolean).join(' - '),
    left + 465,
    y,
    87,
    34,
    18,
    yellow,
  );

  y -= 42;
  ops.push(pdfFillRect(left, y - 16, pageW, 16, yellow));
  ops.push(pdfRect(left, y - 16, pageW, 16));
  ops.push(
    pdfText(
      'Employees Name (Signature all boxes were filled & checked is accurate)',
      left + 92,
      y - 11,
      7,
      'F2',
    ),
  );
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
  const colEnds = [0, 98, 176, 238, 300, 362, 400, 436, 552];
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
  const subH = 14;
  const subLabels = ['ST', 'OT', 'DT'];

  employeeRows.forEach((row, index) => {
    const st = row.workerId ? numberField(row.st ?? row.regularHours) : 0;
    const ot = row.workerId ? numberField(row.ot ?? row.overtimeHours) : 0;
    const dt = row.workerId ? numberField(row.dt ?? row.doubleTimeHours) : 0;
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

    const rowH = subH * 3;
    const rowY = y;
    const nameText = fitText(
      row.workerName || row.name || row.workerId || '',
      24,
    );
    const sigText =
      isSignaturePath(row.signature) || isSignatureImage(row.signature)
        ? ''
        : row.signature
          ? 'Captured'
          : '';
    const dayNight = fitText(
      row.dayOrNight || row.dayNight || row.shiftPeriod || '',
      4,
    );

    // Alternating background for employee column
    if (index % 2 === 1) {
      ops.push(
        pdfFillRect(tableX, rowY - rowH, colEnds[1], rowH, [0.98, 0.96, 0.78]),
      );
    }

    // Col 0: Employee (spans 3 sub-rows)
    ops.push(pdfRect(tableX, rowY - rowH, colEnds[1], rowH));
    if (row.workerId) {
      ops.push(pdfText(nameText, tableX + 3, rowY - 18, 8));
      ops.push(
        pdfText(
          firstString(row.roleNames || row.employeeLabel || ''),
          tableX + 3,
          rowY - 30,
          6,
        ),
      );
    }

    // Col 1: Signature (spans 3 sub-rows)
    ops.push(
      pdfRect(tableX + colEnds[1], rowY - rowH, colEnds[2] - colEnds[1], rowH),
    );
    ops.push(pdfText(sigText, tableX + colEnds[1] + 3, rowY - 18, 8));
    if (row.signature) {
      drawSignature(
        ops,
        images,
        row.signature,
        tableX + colEnds[1] + 2,
        rowY - rowH + 1,
        colEnds[2] - colEnds[1] - 4,
        rowH - 2,
      );
    }

    // Col 6: D/N (spans 3 sub-rows)
    ops.push(
      pdfRect(tableX + colEnds[6], rowY - rowH, colEnds[7] - colEnds[6], rowH),
    );
    ops.push(
      pdfText(
        dayNight,
        tableX + colEnds[6] + (colEnds[7] - colEnds[6]) / 2 - 4,
        rowY - 20,
        8,
        'F2',
      ),
    );

    // Col 7: Notes (spans 3 sub-rows)
    ops.push(
      pdfRect(tableX + colEnds[7], rowY - rowH, colEnds[8] - colEnds[7], rowH),
    );
    ops.push(
      pdfText(fitText(rowNotes, 28), tableX + colEnds[7] + 3, rowY - 18, 7),
    );

    // Per-sub-row columns: 1st Job#, 2nd Job#, 3rd Job#, Total
    const subValues = [st, ot, dt];
    for (let si = 0; si < 3; si++) {
      const subY = rowY - si * subH;
      const val = subValues[si];
      const label = subLabels[si];

      // Col 2: 1st Job #
      ops.push(
        pdfRect(
          tableX + colEnds[2],
          subY - subH,
          colEnds[3] - colEnds[2],
          subH,
        ),
      );
      if (si === 0) {
        ops.push(
          pdfText(fitText(jobNumber, 10), tableX + colEnds[2] + 3, subY - 9, 7),
        );
      }

      // Col 3: 2nd Job #
      ops.push(
        pdfRect(
          tableX + colEnds[3],
          subY - subH,
          colEnds[4] - colEnds[3],
          subH,
        ),
      );
      if (si === 0) {
        ops.push(
          pdfText(
            fitText(row.secondJobHours || '', 10),
            tableX + colEnds[3] + 3,
            subY - 9,
            7,
          ),
        );
      }

      // Col 4: 3rd Job #
      ops.push(
        pdfRect(
          tableX + colEnds[4],
          subY - subH,
          colEnds[5] - colEnds[4],
          subH,
        ),
      );
      if (si === 0) {
        ops.push(
          pdfText(
            fitText(row.thirdJobHours || '', 10),
            tableX + colEnds[4] + 3,
            subY - 9,
            7,
          ),
        );
      }

      // Col 5: Total
      ops.push(
        pdfRect(
          tableX + colEnds[5],
          subY - subH,
          colEnds[6] - colEnds[5],
          subH,
        ),
      );
      ops.push(
        pdfText(
          `${label} ${fitText(val, 3)}`,
          tableX + colEnds[5] + 2,
          subY - 9,
          6.5,
          'F2',
        ),
      );
    }
    y -= rowH;
  });

  const grandTotal = grandSt + grandOt + grandDt;
  let totalX = tableX;
  [
    { text: 'Hours Worked', w: 176 },
    {
      text: `ST ${fitText(grandSt, 5)}  OT ${fitText(grandOt, 5)}  DT ${fitText(grandDt, 5)}`,
      w: 62,
    },
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
  ops.push(
    pdfText('Customer Contract / Approval', left + 270, y - 24, 6, 'F2'),
  );
  if (employeeForemanSignature) {
    drawSignature(
      ops,
      images,
      employeeForemanSignature,
      left + 4,
      y - 12,
      178,
      25,
    );
  }
  if (customerApprovalSignature) {
    drawSignature(
      ops,
      images,
      customerApprovalSignature,
      left + 274,
      y - 12,
      238,
      25,
    );
  }
  ops.push(pdfText(`Submission ${compactId(submission.id, 24)}`, left, 28, 6));

  return buildPdfContentPdf(ops.join('\n'), images);
}

export function buildWorkOrderPdf(
  submission: FormSubmission,
  template: FormTemplate | null,
  context: WorkOrderPdfContext,
): Buffer {
  const data = submission.data ?? {};
  const images: PdfImage[] = [];
  const logo = loadCommercialPdfLogoImage('Logo', 'drtraffic-logo-horizontal.png');
  if (logo) images.push(logo);
  const submittedAt = submission.submittedAt
    ? new Date(submission.submittedAt)
    : new Date();
  const workOrder = context.workOrder;
  const project = context.project;
  const clientRecord = context.client;
  const shiftRecord = context.shift ?? {};
  const dateValue =
    fieldValue(data, ['work_date', 'workDate', 'date']) ||
    shiftRecord.date ||
    submittedAt.toISOString().slice(0, 10);
  const jobNumber =
    fieldValue(data, ['dr_traffic_job_number', 'drTrafficJobNumber']) ||
    project?.number ||
    workOrder?.orderNumber ||
    submission.projectId;
  const jobName =
    fieldValue(data, ['job_name', 'jobName']) ||
    project?.name ||
    workOrder?.title ||
    submission.workOrderId;
  const description =
    fieldValue(data, ['description_of_work', 'descriptionOfWork']) ||
    project?.description ||
    workOrder?.dispatchNote ||
    workOrder?.notes;
  const client = fieldValue(data, ['client']) || clientRecord?.name || '';
  const contact =
    fieldValue(data, ['contact']) ||
    clientRecord?.contactName ||
    workOrder?.requesterName ||
    '';
  const customerOrder =
    fieldValue(data, ['customer_order_number', 'customerOrderNumber']) ||
    project?.purchaseOrder ||
    '';
  const shift =
    fieldValue(data, ['work_shift', 'workShift']) ||
    shiftRecord.shiftTypeName ||
    shiftRecord.shiftName ||
    '';
  const notes = [
    fieldValue(data, ['extra_work_details', 'extraWorkDetails']),
    fieldValue(data, ['notes']),
    workOrder?.notes,
  ]
    .filter((value) => String(value ?? '').trim())
    .join(' | ');
  const displayNumber =
    workOrder?.orderNumber ||
    fieldValue(data, ['work_order_number', 'workOrderNumber']) ||
    submission.workOrderId ||
    compactId(submission.id, 16);
  const shiftText = String(shift).toLowerCase();
  const left = 17.64;
  const width = 576.72;
  const accent: [number, number, number] = [0.929, 0.451, 0.463];
  const ops: string[] = ['0.75 w', '0 0 0 RG', pdfRect(0.75, 0.75, 610.5, 790.5)];

  // Exact geometry from the supplied HTML/CSS Letter template.
  if (logo) ops.push('q 160.56 0 0 53.52 39.24 679.48 cm /Logo Do Q');
  ops.push(pdfText('WORK ORDER', 320.4, 711.8, 12, 'F2'));
  ops.push('0.835 0 0 rg');
  ops.push(pdfText(`No.  ${compactId(displayNumber, 20)}`, 456, 711.8, 12, 'F2'));
  ops.push('0 0 0 rg');
  ops.push('0.835 0 0 rg');
  ops.push(pdfText('DR Traffic Control, LLC', 226, 666.5, 12, 'F2'));
  ops.push('0 0 0 rg');
  ops.push(pdfText('2285 Revere Ave, San Francisco, CA 94124, USA', 218, 655, 6, 'F2'));
  ops.push(pdfText('CSLB #1099211            www.drtrafficcontrol.com', 222, 646.5, 6, 'F2'));
  ops.push(pdfText('Phone: 415-441-4410        info@drtrafficcontrol.com', 219, 638, 6, 'F2'));

  let top = 614.2;
  const topWidths = [width * 0.354, width * 0.312, width * 0.334];
  const drawTopCell = (
    label: string,
    value: unknown,
    x: number,
    y: number,
    w: number,
    h: number,
    max: number,
  ) => {
    ops.push(pdfRect(x, y - h, w, h));
    ops.push(pdfText(label, x + 2, y - 5.5, 5.25, 'F2'));
    const text = fitText(value, max);
    if (text) ops.push(pdfText(text, x + 2, y - h + 3.5, 6));
  };

  drawTopCell('DR TRAFFIC JOB#', jobNumber, left, top, topWidths[0], 15.75, 34);
  drawTopCell('JOB NAME:', jobName, left + topWidths[0], top, topWidths[1], 15.75, 31);
  drawTopCell('DATE:', dateValue, left + topWidths[0] + topWidths[1], top, topWidths[2], 15.75, 24);
  top -= 15.75;
  drawTopCell('DESCRIPTION OF WORK:', description, left, top, width, 16.5, 116);
  top -= 16.5;
  drawTopCell('CLIENT:', client, left, top, topWidths[0] + topWidths[1], 15.75, 72);
  drawTopCell(
    'CUSTOMER ORDER #',
    customerOrder,
    left + topWidths[0] + topWidths[1],
    top,
    topWidths[2],
    15.75,
    31,
  );
  top -= 15.75;
  drawTopCell('CONTACT:', contact, left, top, topWidths[0] + topWidths[1], 15.75, 72);
  const shiftX = left + topWidths[0] + topWidths[1];
  ops.push(pdfRect(shiftX, top - 15.75, topWidths[2], 15.75));
  ops.push(pdfText('WORK SHIFT', shiftX + 2, top - 5.5, 5.25, 'F2'));
  const drawShiftChoice = (
    label: string,
    checked: boolean,
    x: number,
  ) => {
    ops.push(pdfRect(x, top - 12, 5, 5));
    if (checked) {
      ops.push(pdfLine(x + 1, top - 10, x + 2.2, top - 11.2));
      ops.push(pdfLine(x + 2.2, top - 11.2, x + 4.4, top - 7.8));
    }
    ops.push(pdfText(label, x + 8, top - 11, 5.25, 'F2'));
  };
  drawShiftChoice('DAY', shiftText.includes('day'), shiftX + 65);
  drawShiftChoice('SWING', shiftText.includes('swing'), shiftX + 111);
  drawShiftChoice('NIGHT', shiftText.includes('night'), shiftX + 164);
  top -= 15.75;

  const checkWeights = [1.5, 1.35, 1.15, 1.25, 1.45];
  const checkLabels = ['FIELD SERVICE', 'INTERNAL SALE', 'SALES', 'ON RENT', 'OFF RENT'];
  const checkStates = [
    true,
    false,
    false,
    Boolean(fieldValue(data, ['on_rent', 'onRent'])),
    Boolean(fieldValue(data, ['off_rent', 'offRent'])),
  ];
  let checkX = left;
  checkWeights.forEach((weight, index) => {
    const checkWidth = (width * weight) / 6.7;
    ops.push(pdfRect(checkX, top - 16.5, checkWidth, 16.5));
    const fontSize = 6.75;
    const labelWidth = checkLabels[index].length * fontSize * 0.52;
    const boxSize = 5;
    const gap = 5;
    const contentWidth = labelWidth + gap + boxSize;
    const contentX = checkX + (checkWidth - contentWidth) / 2;
    const boxX = contentX + labelWidth + gap;
    const baselineY = top - 10.5;
    ops.push(
      pdfText(checkLabels[index], contentX, baselineY, fontSize, 'F2'),
    );
    ops.push(pdfRect(boxX, baselineY - 1, boxSize, boxSize));
    if (checkStates[index]) {
      ops.push(pdfLine(boxX + 1, baselineY + 1, boxX + 2.2, baselineY - 0.2));
      ops.push(
        pdfLine(boxX + 2.2, baselineY - 0.2, boxX + 4.4, baselineY + 3.4),
      );
    }
    checkX += checkWidth;
  });
  top -= 16.5;

  const workPercentages = [32.1, 5.8, 6.8, 5.5, 5.3, 5.3, 7.6, 25.7, 5.9];
  const workCols = workPercentages.map((percentage) => (width * percentage) / 100);
  const workXs: number[] = [];
  let workX = left;
  workCols.forEach((columnWidth) => {
    workXs.push(workX);
    workX += columnWidth;
  });

  const sectionHeight = 14.25;
  const laborWidth = workCols.slice(0, 3).reduce((sum, value) => sum + value, 0);
  const hoursWidth = workCols.slice(3, 6).reduce((sum, value) => sum + value, 0);
  const equipmentWidth = workCols.slice(6).reduce((sum, value) => sum + value, 0);
  ops.push(pdfFillRect(left, top - sectionHeight, laborWidth, sectionHeight, accent));
  ops.push(pdfFillRect(left + laborWidth, top - sectionHeight, hoursWidth, sectionHeight, accent));
  ops.push(pdfFillRect(left + laborWidth + hoursWidth, top - sectionHeight, equipmentWidth, sectionHeight, accent));
  ops.push(pdfRect(left, top - sectionHeight, laborWidth, sectionHeight));
  ops.push(pdfRect(left + laborWidth, top - sectionHeight, hoursWidth, sectionHeight));
  ops.push(pdfRect(left + laborWidth + hoursWidth, top - sectionHeight, equipmentWidth, sectionHeight));
  ops.push(pdfText('LABOR', left + laborWidth / 2 - 13, top - 10, 6.75, 'F2'));
  ops.push(pdfText('HOURS', left + laborWidth + hoursWidth / 2 - 14, top - 10, 6.75, 'F2'));
  ops.push(pdfText('EQUIPMENT', left + laborWidth + hoursWidth + equipmentWidth / 2 - 20, top - 10, 6.75, 'F2'));
  top -= sectionHeight;

  const workHeaders = [
    'EMPLOYEE NAME',
    'START',
    'END',
    'REG',
    'OT',
    'DT',
    'EQUIP ID',
    'EQUIP DESCRIPTION',
    'HRS',
  ];
  const columnHeight = 12.75;
  workCols.forEach((columnWidth, index) => {
    ops.push(pdfRect(workXs[index], top - columnHeight, columnWidth, columnHeight));
    ops.push(
      pdfText(
        workHeaders[index],
        workXs[index] + Math.max(2, columnWidth / 2 - workHeaders[index].length * 1.5),
        top - 8.7,
        5.25,
      ),
    );
  });
  top -= columnHeight;

  const rowCount = Math.max(7, context.workers.length, Math.ceil(context.equipment.length / 2));
  const workerBlockHeight = 157.5 / rowCount;
  const workerSubRowHeight = workerBlockHeight / 2;
  for (let index = 0; index < rowCount; index += 1) {
    const worker = context.workers[index];
    const equipmentTop = context.equipment[index * 2];
    const equipmentBottom = context.equipment[index * 2 + 1];
    const firstColumnSplit = workCols[0] * 0.821;
    const breakAreaX = workXs[1];
    const breakAreaWidth = workCols[1] + workCols[2];
    const breakParts = [
      breakAreaWidth * 0.253,
      breakAreaWidth * 0.458,
      breakAreaWidth * 0.289,
    ];

    for (let row = 0; row < 2; row += 1) {
      workCols.forEach((columnWidth, columnIndex) => {
        ops.push(
          pdfRect(
            workXs[columnIndex],
            top - workerSubRowHeight,
            columnWidth,
            workerSubRowHeight,
          ),
        );
      });
      top -= workerSubRowHeight;
    }

    const blockTop = top + workerBlockHeight;
    const personBaseline = blockTop - workerSubRowHeight + 2.5;
    const signBaseline = top + 2.5;
    ops.push(
      pdfLine(
        left + firstColumnSplit,
        blockTop,
        left + firstColumnSplit,
        blockTop - workerBlockHeight,
      ),
    );
    ops.push(
      pdfLine(
        breakAreaX + breakParts[0] + breakParts[1],
        blockTop - workerSubRowHeight,
        breakAreaX + breakParts[0] + breakParts[1],
        top,
      ),
    );

    ops.push(pdfText('Name', left + 2, personBaseline, 5.25, 'F2'));
    ops.push(pdfText('SHIFT', left + firstColumnSplit + 2, personBaseline, 5.25, 'F2'));
    ops.push(pdfText('Sign', left + 2, signBaseline, 5.25, 'F2'));
    ops.push(pdfText('Lunch:', left + firstColumnSplit + 2, signBaseline, 5.25, 'F2'));
    ops.push(pdfRect(breakAreaX + breakParts[0] / 2 - 2.5, signBaseline - 1, 5, 5));
    ops.push(pdfText('Breaks:', breakAreaX + breakParts[0] + 3, signBaseline, 5.25, 'F2'));
    ops.push(
      pdfRect(
        breakAreaX + breakParts[0] + breakParts[1] + breakParts[2] / 2 - 2.5,
        signBaseline - 1,
        5,
        5,
      ),
    );

    if (worker) {
      ops.push(
        pdfText(
          fitText(worker.workerName, 34),
          left + 31,
          personBaseline,
          5.1,
          'F2',
        ),
      );
      ops.push(pdfText(formatPdfClock(worker.startTime), workXs[1] + 2, personBaseline, 5.2));
      ops.push(pdfText(formatPdfClock(worker.endTime), workXs[2] + 2, personBaseline, 5.2));
      ops.push(pdfText(String(worker.regularHours), workXs[3] + 8, personBaseline, 5.5));
      ops.push(pdfText(String(worker.overtimeHours), workXs[4] + 8, personBaseline, 5.5));
      ops.push(pdfText(String(worker.doubleTimeHours), workXs[5] + 8, personBaseline, 5.5));
      if (worker.lunchTaken) {
        ops.push(pdfLine(breakAreaX + breakParts[0] / 2 - 1.5, signBaseline + 1, breakAreaX + breakParts[0] / 2 - 0.2, signBaseline));
        ops.push(pdfLine(breakAreaX + breakParts[0] / 2 - 0.2, signBaseline, breakAreaX + breakParts[0] / 2 + 2, signBaseline + 3.5));
      }
      if (worker.lunchTaken || worker.breakMinutes > 0) {
        const bx = breakAreaX + breakParts[0] + breakParts[1] + breakParts[2] / 2;
        ops.push(pdfLine(bx - 1.5, signBaseline + 1, bx - 0.2, signBaseline));
        ops.push(pdfLine(bx - 0.2, signBaseline, bx + 2, signBaseline + 3.5));
      }
      if (worker.signature) {
        const workerSignatureWidth = Math.min(82, firstColumnSplit - 38);
        const workerSignatureHeight = Math.min(
          workerBlockHeight - 4,
          workerSubRowHeight + 4,
        );
        drawSignature(
          ops,
          images,
          worker.signature,
          left + firstColumnSplit - workerSignatureWidth - 7,
          top - 2,
          workerSignatureWidth,
          workerSignatureHeight,
          1,
        );
      }
    }

    const drawEquipment = (
      equipment: WorkOrderPdfResource | undefined,
      baseline: number,
    ) => {
      if (!equipment) return;
      ops.push(pdfText(fitText(equipment.identifier, 11), workXs[6] + 2, baseline, 5.2));
      ops.push(pdfText(fitText(equipment.description, 31), workXs[7] + 2, baseline, 5.2));
    };
    drawEquipment(equipmentTop, personBaseline);
    drawEquipment(equipmentBottom, signBaseline);

    if (worker) {
      const totalHours =
        Number(worker.regularHours || 0) +
        Number(worker.overtimeHours || 0) +
        Number(worker.doubleTimeHours || 0);
      if (totalHours > 0) {
        ops.push(
          pdfText(
            Number.isInteger(totalHours) ? String(totalHours) : totalHours.toFixed(2),
            workXs[8] + 4,
            personBaseline,
            5.5,
          ),
        );
      }
    }
  }

  const materialPercentages = [26.4, 8.9, 6.9, 8.4, 49.4];
  const materialCols = materialPercentages.map((percentage) => (width * percentage) / 100);
  const materialXs: number[] = [];
  let materialX = left;
  materialCols.forEach((columnWidth) => {
    materialXs.push(materialX);
    materialX += columnWidth;
  });
  const materialWidth = materialCols.slice(0, 4).reduce((sum, value) => sum + value, 0);
  ops.push(pdfFillRect(left, top - sectionHeight, materialWidth, sectionHeight, accent));
  ops.push(pdfFillRect(left + materialWidth, top - sectionHeight, materialCols[4], sectionHeight, accent));
  ops.push(pdfRect(left, top - sectionHeight, materialWidth, sectionHeight));
  ops.push(pdfRect(left + materialWidth, top - sectionHeight, materialCols[4], sectionHeight));
  ops.push(pdfText('MATERIAL', left + materialWidth / 2 - 16, top - 10, 6.75, 'F2'));
  ops.push(pdfText('NOTES', left + materialWidth + materialCols[4] / 2 - 11, top - 10, 6.75, 'F2'));
  top -= sectionHeight;

  const materialHeaders = ['DESCRIPTION', 'SIZE', 'QTY', 'PRICE', ''];
  materialCols.forEach((columnWidth, index) => {
    ops.push(pdfRect(materialXs[index], top - columnHeight, columnWidth, columnHeight));
    if (materialHeaders[index]) {
      ops.push(
        pdfText(
          materialHeaders[index],
          materialXs[index] + Math.max(2, columnWidth / 2 - materialHeaders[index].length * 1.4),
          top - 8.7,
          5.25,
        ),
      );
    }
  });
  top -= columnHeight;

  const materialRowHeight = 12.75;
  for (let index = 0; index < 13; index += 1) {
    const material = context.materials[index];
    materialCols.forEach((columnWidth, columnIndex) => {
      ops.push(pdfRect(materialXs[columnIndex], top - materialRowHeight, columnWidth, materialRowHeight));
    });
    if (material) {
      ops.push(pdfText(fitText(material.description, 34), materialXs[0] + 2, top - 8.7, 5.2));
    }
    top -= materialRowHeight;
  }

  const foremanSignature =
    findSignatureValue(data, template, [/foreman/, /employee/, /dr.?traffic/, /rep/]) ||
    context.workers.find(
      (worker) =>
        /\b(lead|foreman|supervisor|manager|superintendent)\b/i.test(
          worker.roleName,
        ) && worker.signature,
    )?.signature;
  const customerSignature = findSignatureValue(data, template, [
    /customer/,
    /contract/,
    /owner/,
    /general/,
    /approval/,
  ]);

  const footerY = 88;
  ops.push(pdfText('DR TRAFFIC REP. (NAME)', left + 2, footerY, 5.6, 'F2'));
  ops.push(pdfLine(left + 101, footerY - 1, left + 247, footerY - 1));
  ops.push(
    pdfText(
      'OWNER / GENERAL CONTRACTOR REP. (NAME)',
      left + 288,
      footerY,
      5.6,
      'F2',
    ),
  );
  ops.push(pdfLine(left + 464, footerY - 1, left + 574, footerY - 1));
  if (foremanSignature) {
    drawSignature(
      ops,
      images,
      foremanSignature,
      left + 93,
      footerY + 1,
      165,
      34,
      0.88,
    );
  }
  if (customerSignature) {
    drawSignature(
      ops,
      images,
      customerSignature,
      left + 453,
      footerY + 1,
      126,
      34,
      0.88,
    );
  }
  ops.push(
    pdfText(
      'I hereby acknowledge the satisfactory completion of the above described work and accept the Terms &',
      left + 288,
      footerY - 10,
      4.6,
    ),
  );
  ops.push(pdfText('Conditions on the reverse side.', left + 288, footerY - 16, 4.6));

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
    @InjectRepository(WorkOrder)
    private readonly workOrdersRepo: Repository<WorkOrder>,
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>,
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
    @InjectRepository(Equipment)
    private readonly equipmentRepo: Repository<Equipment>,
    @InjectRepository(Material)
    private readonly materialsRepo: Repository<Material>,
    @InjectRepository(Timesheet)
    private readonly timesheetsRepo: Repository<Timesheet>,
    private readonly realtime: RealtimeGateway,
    private readonly spacesStorage: SpacesStorageService,
    private readonly timesheetsService: TimesheetsService,
    private readonly shiftsQuery: ShiftsQueryService,
  ) {}

  findAll(
    filters?: {
      projectId?: string;
      workOrderId?: string;
      templateId?: string;
      shiftId?: string;
      timesheetScope?: TimesheetScope;
    },
    actor?: UserAccessContext,
  ) {
    const projectId = filters?.projectId?.trim();
    const workOrderId = filters?.workOrderId?.trim();
    const templateId = filters?.templateId?.trim();
    const shiftId = filters?.shiftId?.trim();
    const timesheetScope = filters?.timesheetScope;
    const hasFilters = Boolean(
      projectId || workOrderId || templateId || shiftId,
    );
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
      { workOrderId: dto.workOrderId, shiftId: dto.shiftId },
    );

    if (template) {
      validateSubmissionAgainstFields(
        normalizeFormFields(template.fields),
        data,
        { mobileRole: this.mobileValidationRole(template, actor) },
      );
    }

    const isSelfTimesheet = await this.isMobileSelfTimesheetSubmission(
      template,
      actor,
      data,
    );
    const generatePdf = shouldGenerateSubmissionPdf(template, actor);
    const saved = await this.repo.save(
      this.repo.create({
        ...dto,
        workerId:
          isSelfTimesheet && actor
            ? await this.resolveWorkerIdForActor(actor)
            : dto.workerId,
        data,
        pdfUrl: generatePdf ? dto.pdfUrl : '',
        submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : undefined,
      }),
    );
    await this.syncTimesheetsFromSubmission(saved);
    await this.syncIncidentFromSubmission(saved, template);
    if (generatePdf) {
      saved.pdfUrl = await this.generatePdf(saved, template);
      await this.repo.save(saved);
    }
    this.realtime.emitTableUpdated('form_submissions');
    this.realtime.emitTableUpdated('work_orders');
    return saved;
  }

  async update(
    id: string,
    dto: UpdateFormSubmissionDto,
    actor?: UserAccessContext,
  ) {
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
            {
              workOrderId: dto.workOrderId || item.workOrderId,
              shiftId: dto.shiftId || item.shiftId,
            },
          )
        : item.data;

    if (template) {
      validateSubmissionAgainstFields(
        normalizeFormFields(template.fields),
        data,
        { mobileRole: this.mobileValidationRole(template, actor) },
      );
    }

    const isSelfTimesheet = await this.isMobileSelfTimesheetSubmission(
      template,
      actor,
      data,
    );
    const generatePdf = shouldGenerateSubmissionPdf(template, actor);
    Object.assign(item, {
      ...dto,
      workerId:
        isSelfTimesheet && actor
          ? await this.resolveWorkerIdForActor(actor)
          : (dto.workerId ?? item.workerId),
      data,
      pdfUrl: generatePdf ? (dto.pdfUrl ?? item.pdfUrl) : '',
      submittedAt:
        dto.submittedAt !== undefined ? new Date(dto.submittedAt) : undefined,
    });
    const saved = await this.repo.save(item);
    await this.syncTimesheetsFromSubmission(saved);
    await this.syncIncidentFromSubmission(saved, template);
    if (generatePdf) {
      await this.deleteGeneratedPdf(previousPdfUrl);
      saved.pdfUrl = await this.generatePdf(saved, template);
      await this.repo.save(saved);
    } else {
      await this.deleteGeneratedPdf(previousPdfUrl);
    }
    this.realtime.emitTableUpdated('form_submissions');
    this.realtime.emitTableUpdated('work_orders');
    return saved;
  }

  private async prepareTimesheetData(
    data: Record<string, unknown> | undefined,
    template: FormTemplate | null,
    actor?: UserAccessContext,
    opts?: { workOrderId?: string; shiftId?: string },
  ) {
    const normalized = normalizeSubmissionData(data);
    if (!isTimesheetTemplate(template)) return normalized;

    const isSelfTimesheet = await this.isMobileSelfTimesheetSubmission(
      template,
      actor,
      normalized,
    );
    const workerId = isSelfTimesheet
      ? await this.resolveWorkerIdForActor(actor)
      : '';
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(normalized)) {
      if (Array.isArray(value) && value.some(isTimesheetRowLike)) {
        next[key] = await Promise.all(
          value
            .filter(
              (row) =>
                isTimesheetRowLike(row) &&
                (!isSelfTimesheet || row.workerId === workerId),
            )
            .map((row) =>
              this.timesheetsService.normalizeSubmissionRow(row, opts),
            ),
        );
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
    return this.isMobileTimesheetRequest(template, actor)
      ? actor?.role
      : undefined;
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
      if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    }
    return '';
  }

  private dataDate(
    data: Record<string, unknown>,
    keys: string[],
    fallback?: Date | null,
  ) {
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
    const incidentType = this.dataString(data, [
      'incident_type',
      'incidentType',
      'type',
    ]);
    const title =
      this.dataString(data, ['title', 'incident_title', 'incidentTitle']) ||
      (incidentType
        ? `${incidentType} Incident`
        : template?.name || 'Incident Report');
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
      this.dataString(data, ['incident_status', 'incidentStatus', 'status'])
        .trim()
        .toLowerCase() ||
      'open';

    const incident = this.incidentsRepo.create({
      ...(existing ?? {}),
      id,
      projectId: submission.projectId || existing?.projectId || '',
      reportedBy:
        submission.workerId ||
        this.dataString(data, [
          'reported_by',
          'reportedBy',
          'person_reporting',
          'personReporting',
        ]) ||
        existing?.reportedBy ||
        '',
      date: this.dataDate(
        data,
        ['incident_date', 'incidentDate', 'report_date', 'reportDate'],
        submission.submittedAt,
      ),
      severity: this.normalizeIncidentSeverity(
        this.dataString(data, ['severity', 'severity_level', 'severityLevel']),
      ),
      status,
      title: title.slice(0, 255),
      description,
      location: this.dataString(data, [
        'incident_location',
        'incidentLocation',
        'location',
      ]),
      actions: this.dataString(data, [
        'immediate_actions_taken',
        'immediateActionsTaken',
        'actions',
        'actions_taken',
        'actionsTaken',
      ]),
      photos: Array.isArray(data.photos_evidence)
        ? data.photos_evidence.map((item) => String(item)).filter(Boolean)
        : (existing?.photos ?? []),
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
    const templateIds = [
      ...new Set(rows.map((row) => row.templateId).filter(Boolean)),
    ];
    const templates =
      templateIds.length > 0
        ? await this.templatesRepo.find({ where: { id: In(templateIds) } })
        : [];
    const timesheetTemplateIds = new Set(
      templates
        .filter((template) =>
          (template.category || '').toLowerCase().includes('timesheet'),
        )
        .map((template) => template.id),
    );

    return rows.filter((row) => {
      if (!timesheetTemplateIds.has(row.templateId)) return true;
      if (!workerId) return true;
      if (row.workerId) return row.workerId === workerId;
      const timesheetRows = findTimesheetRows(row.data ?? {});
      if (timesheetRows.length === 0) return true;
      return timesheetRows.some(
        (timesheetRow) => timesheetRow.workerId === workerId,
      );
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
    this.realtime.emitTableUpdated('work_orders');
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

  private stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  private async loadWorkOrderPdfContext(
    submission: FormSubmission,
  ): Promise<WorkOrderPdfContext> {
    const workOrder = submission.workOrderId
      ? await this.workOrdersRepo.findOne({
          where: { id: submission.workOrderId },
        })
      : null;
    const projectId = workOrder?.projectId || submission.projectId;
    const project = projectId
      ? await this.projectsRepo.findOne({ where: { id: projectId } })
      : null;
    const client = project?.clientId
      ? await this.clientsRepo.findOne({ where: { id: project.clientId } })
      : null;
    const relationalShifts = workOrder?.id
      ? (await this.shiftsQuery.loadShiftsForWorkOrder(workOrder.id)) ?? []
      : [];
    const shift =
      relationalShifts.find((entry) => entry?.id === submission.shiftId) ?? null;
    const roles = Array.isArray(shift?.roles)
      ? shift.roles
          .map(recordValue)
          .filter(
            (role): role is Record<string, unknown> => role !== null,
          )
      : [];

    const workerIds: string[] = [];
    const equipmentIds: string[] = [];
    const materialIds: string[] = [];
    const workerRole = new Map<string, string>();
    const workerStart = new Map<string, string>();
    for (const role of roles) {
      if (!role) continue;
      const roleName = String(role.roleName ?? role.name ?? '').trim();
      const roleStart = String(
        role.startTime ?? shift?.defaultRoleStartTime ?? shift?.startTime ?? '',
      ).trim();
      for (const workerId of this.stringArray(role.assignedWorkers)) {
        if (!workerIds.includes(workerId)) workerIds.push(workerId);
        if (roleName && !workerRole.has(workerId)) {
          workerRole.set(workerId, roleName);
        }
        if (roleStart && !workerStart.has(workerId)) {
          workerStart.set(workerId, roleStart);
        }
      }
      for (const materialId of this.stringArray(role.assignedMaterials)) {
        if (!materialIds.includes(materialId)) materialIds.push(materialId);
      }
      for (const equipmentId of this.stringArray(role.assignedEquipment)) {
        if (!equipmentIds.includes(equipmentId)) equipmentIds.push(equipmentId);
      }
    }

    // Fallback: when the work order has no rows in the relational shift
    // tables (new WO created with shifts:[] before the user added a shift),
    // harvest workers/equipment/materials from the submission form data.
    if (workerIds.length === 0) {
      for (const row of findTimesheetRows(submission.data ?? {})) {
        const workerId = String(row.workerId ?? '').trim();
        if (workerId && !workerIds.includes(workerId)) {
          workerIds.push(workerId);
        }
      }
    }
    if (equipmentIds.length === 0) {
      for (const row of findResourceRows(submission.data ?? {}, 'equipmentId')) {
        const equipmentId = String(row.equipmentId ?? '').trim();
        if (equipmentId && !equipmentIds.includes(equipmentId)) {
          equipmentIds.push(equipmentId);
        }
      }
    }
    if (materialIds.length === 0) {
      for (const row of findResourceRows(submission.data ?? {}, 'materialId')) {
        const materialId = String(row.materialId ?? '').trim();
        if (materialId && !materialIds.includes(materialId)) {
          materialIds.push(materialId);
        }
      }
    }

    const [workerRecords, equipmentRecords, materialRecords, timesheets] =
      await Promise.all([
        workerIds.length
          ? this.workersRepo.find({ where: { id: In(workerIds) } })
          : Promise.resolve([]),
        equipmentIds.length
          ? this.equipmentRepo.find({ where: { id: In(equipmentIds) } })
          : Promise.resolve([]),
        materialIds.length
          ? this.materialsRepo.find({ where: { id: In(materialIds) } })
          : Promise.resolve([]),
        workOrder?.id && submission.shiftId
          ? this.timesheetsRepo.find({
              where: {
                workOrderId: workOrder.id,
                shiftId: submission.shiftId,
              },
            })
          : Promise.resolve([]),
      ]);

    const submittedRows = findTimesheetRows(submission.data ?? {});
    const submittedByWorker = new Map(
      submittedRows.map((row) => [String(row.workerId ?? ''), row]),
    );
    const workersById = new Map(
      workerRecords.map((worker) => [worker.id, worker]),
    );
    const timesheetByWorker = new Map(
      timesheets.map((timesheet) => [timesheet.workerId, timesheet]),
    );
    const shiftEnd = String(shift?.endTime ?? '').trim();
    const workers = workerIds.map((workerId) => {
      const worker = workersById.get(workerId);
      const timesheet = timesheetByWorker.get(workerId);
      const submitted = submittedByWorker.get(workerId) ?? {};
      const submittedRoles = Array.isArray(submitted.roleNames)
        ? submitted.roleNames.filter(
            (value): value is string => typeof value === 'string',
          )
        : [];
      return {
        workerId,
        workerName:
          String(submitted.workerName ?? submitted.name ?? '').trim() ||
          [worker?.firstName, worker?.lastName]
            .filter(Boolean)
            .join(' ')
            .trim() ||
          workerId,
        roleName:
          submittedRoles.join(', ') ||
          String(submitted.roleName ?? '').trim() ||
          workerRole.get(workerId) ||
          worker?.role ||
          '',
        startTime:
          timesheet?.clockIn ||
          String(
            submitted.startTime ?? submitted.scheduledStartTime ?? '',
          ).trim() ||
          workerStart.get(workerId) ||
          '',
        endTime:
          timesheet?.clockOut ||
          String(
            submitted.endTime ?? submitted.scheduledEndTime ?? '',
          ).trim() ||
          shiftEnd,
        regularHours: Number(
          timesheet?.regularHours ??
            submitted.st ??
            submitted.regularHours ??
            0,
        ),
        overtimeHours: Number(
          timesheet?.overtimeHours ??
            submitted.ot ??
            submitted.overtimeHours ??
            0,
        ),
        doubleTimeHours: Number(
          timesheet?.doubleTimeHours ??
            submitted.dt ??
            submitted.doubleTimeHours ??
            0,
        ),
        lunchTaken:
          timesheet?.lunchTaken ??
          Boolean(submitted.lunchTaken ?? submitted.lunchAndBreakTaken),
        breakMinutes: Number(
          timesheet?.breakMinutes ?? submitted.breakMinutes ?? 0,
        ),
        signature:
          parseStoredJson(timesheet?.signature) ||
          submitted.signature ||
          submitted.workerSignature ||
          '',
      } satisfies WorkOrderPdfWorker;
    });

    const equipmentById = new Map(
      equipmentRecords.map((equipment) => [equipment.id, equipment]),
    );
    const equipmentHours = String(
      fieldValue(submission.data ?? {}, [
        'equipment_hours',
        'equipmentHours',
      ]) ?? '',
    ).trim();
    const computedEquipmentHours = (() => {
      const totals = workers
        .map(
          (worker) =>
            Number(worker.regularHours || 0) +
            Number(worker.overtimeHours || 0) +
            Number(worker.doubleTimeHours || 0),
        )
        .filter((total) => Number.isFinite(total) && total > 0);
      if (totals.length === 0) return '';
      const total = Math.max(...totals);
      return Number.isInteger(total) ? String(total) : total.toFixed(2);
    })();
    const equipment = equipmentIds.map((equipmentId) => {
      const item = equipmentById.get(equipmentId);
      return {
        identifier: item?.identifier || '',
        description: item?.name || item?.type || '',
        hours: computedEquipmentHours || equipmentHours,
      };
    });

    const materialsById = new Map(
      materialRecords.map((material) => [material.id, material]),
    );
    const materials = materialIds.map((materialId) => {
      const item = materialsById.get(materialId);
      return {
        identifier: item?.identifier || materialId,
        description:
          [item?.identifier, item?.name].filter(Boolean).join(' - ') ||
          materialId,
        size: item?.type || '',
        quantity: '1',
        price: '',
      };
    });

    return {
      workOrder,
      project,
      client,
      workers,
      equipment,
      materials,
      shift,
    };
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
        for (const line of wrapText(
          `${label}: ${stringifyFieldValue(value)}`,
        )) {
          lines.push(line);
        }
      }
    }

    const safeId = basename(submission.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeId}.pdf`;
    const isWorkOrder =
      category.includes('work order') || templateName.includes('work order');
    const workOrderContext = isWorkOrder
      ? await this.loadWorkOrderPdfContext(submission)
      : null;
    const pdf =
      isWorkOrder && workOrderContext
        ? buildWorkOrderPdf(submission, template, workOrderContext)
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
