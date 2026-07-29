import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { ShiftWorkOrderAccessService } from './shift-work-order-access.service';
import { CompanySettingsService } from './company-settings.service';
import {
  normalizeFormFields,
  normalizeSubmissionData,
  validateSubmissionAgainstFields,
} from '../utils/form-contract.util';
import { loadCommercialPdfLogoImage } from '../utils/commercial-pdf.util';
import { findWorkerForActor } from '../utils/worker-actor-lookup.util';

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
  return buildPdfContentPages([content], images);
}

function buildPdfContentPages(contents: string[], images: PdfImage[] = []): Buffer {
  const pageContents = contents.length > 0 ? contents : [''];
  const objects: Array<string | Buffer> = [];
  const pageHeight = 792;
  const pageCount = pageContents.length;
  const firstFontId = 3 + pageCount;
  const secondFontId = firstFontId + 1;
  const firstContentId = secondFontId + 1;
  const firstImageId = firstContentId + pageCount;
  const xObjectResources = images.length
    ? `/XObject << ${images.map((image, index) => `/${image.name} ${firstImageId + index} 0 R`).join(' ')} >>`
    : '';

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Kids [${pageContents.map((_, index) => `${3 + index} 0 R`).join(' ')}] /Count ${pageCount} >>`,
  );
  pageContents.forEach((_, index) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 ${firstFontId} 0 R /F2 ${secondFontId} 0 R >> ${xObjectResources} >> /Contents ${firstContentId + index} 0 R >>`,
    );
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  pageContents.forEach((content) => {
    objects.push(
      `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
    );
  });
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

function approximateHelveticaTextWidth(value: string, fontSize: number): number {
  const widthInEm = [...value].reduce((width, character) => {
    if (character === ' ') return width + 0.278;
    if (/[.,:;!'|ijlI]/.test(character)) return width + 0.25;
    if (/[MW@%&]/.test(character)) return width + 0.85;
    if (/[A-Z]/.test(character)) return width + 0.667;
    if (/[0-9]/.test(character)) return width + 0.556;
    if (/[-_()[\]{}]/.test(character)) return width + 0.333;
    return width + 0.5;
  }, 0);
  return widthInEm * fontSize;
}

function fitPdfTextToWidth(
  value: unknown,
  maxWidth: number,
  preferredSize: number,
  minimumSize = 4,
): { text: string; size: number } {
  const text = stringifyFieldValue(value).replace(/\s+/g, ' ').trim();
  if (!text || text === '-') return { text: '', size: preferredSize };

  const requiredWidth = approximateHelveticaTextWidth(text, preferredSize);
  if (requiredWidth <= maxWidth) return { text, size: preferredSize };

  const adjustedSize = Math.max(
    minimumSize,
    Math.floor((preferredSize * maxWidth * 10) / requiredWidth) / 10,
  );
  if (approximateHelveticaTextWidth(text, adjustedSize) <= maxWidth) {
    return { text, size: adjustedSize };
  }

  let end = text.length;
  while (end > 0) {
    const candidate = `${text.slice(0, end).trimEnd()}...`;
    if (approximateHelveticaTextWidth(candidate, minimumSize) <= maxWidth) {
      return { text: candidate, size: minimumSize };
    }
    end -= 1;
  }
  return { text: '', size: minimumSize };
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
  const values: unknown[] = [...Object.values(data)];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      values.push(...Object.values(value as Record<string, unknown>));
    }
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

function findPlannedMaterialUsageRows(data: Record<string, unknown>) {
  const direct = data.roleMaterialUsage;
  const nested = Object.values(data).flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const materials = (value as Record<string, unknown>).materials;
    return Array.isArray(materials) ? materials : [];
  });
  const rows = [...(Array.isArray(direct) ? direct : []), ...nested];
  return rows.filter((entry): entry is Record<string, unknown> =>
    typeof entry === 'object' && entry !== null &&
    typeof (entry as Record<string, unknown>).type === 'string' &&
    (entry as Record<string, unknown>).actualQuantity !== undefined);
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

function isWorkOrderTemplate(template: FormTemplate | null) {
  if (!template) return false;
  const category = normalizedTemplateText(template.category);
  const name = normalizedTemplateText(template.name);
  return (
    category.includes('work order') ||
    category.includes('workorder') ||
    name.includes('work order') ||
    name.includes('workorder')
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

function signatureFingerprint(value: unknown): string {
  if (isSignatureImage(value)) return `image:${value.dataUrl}`;
  if (isSignaturePath(value)) return `path:${JSON.stringify(value.strokes)}`;
  if (typeof value === 'string') return `string:${value.trim()}`;
  return '';
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
  type?: string;
  quantity?: string;
};

type WorkOrderPdfContext = {
  company?: { name?: string; address?: string; phone?: string; email?: string };
  workOrder?: WorkOrder | null;
  project?: Project | null;
  client?: Client | null;
  workers: WorkOrderPdfWorker[];
  equipment: WorkOrderPdfResource[];
  materials: WorkOrderPdfResource[];
  workOrderTypes: string[];
  shift?: Record<string, unknown> | null;
};

type WorkOrderPdfBuilderConfig = {
  version?: number;
  templateId?: string;
  fields?: Record<string, string>;
  layout?: {
    accentColor?: string;
    workerRows?: number;
    materialRows?: number;
    filenameTemplate?: string;
    labels?: Record<string, string>;
    sections?: Record<string, boolean>;
  };
};

function normalizedPdfBuilderConfig(value: unknown): WorkOrderPdfBuilderConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const rawFields =
    typeof input.fields === 'object' && input.fields !== null && !Array.isArray(input.fields)
      ? (input.fields as Record<string, unknown>)
      : {};
  const rawLayout =
    typeof input.layout === 'object' && input.layout !== null && !Array.isArray(input.layout)
      ? (input.layout as Record<string, unknown>)
      : {};
  const rawLabels =
    typeof rawLayout.labels === 'object' && rawLayout.labels !== null && !Array.isArray(rawLayout.labels)
      ? (rawLayout.labels as Record<string, unknown>)
      : {};
  const rawSections =
    typeof rawLayout.sections === 'object' && rawLayout.sections !== null && !Array.isArray(rawLayout.sections)
      ? (rawLayout.sections as Record<string, unknown>)
      : {};
  const workerRows = Number(rawLayout.workerRows);
  const materialRows = Number(rawLayout.materialRows);
  return {
    version: Number.isFinite(Number(input.version)) ? Number(input.version) : 1,
    templateId: typeof input.templateId === 'string' ? input.templateId.trim() : '',
    fields: Object.fromEntries(
      Object.entries(rawFields)
        .filter(([, fieldId]) => typeof fieldId === 'string' && fieldId.trim())
        .map(([slot, fieldId]) => [slot, String(fieldId).trim()]),
    ),
    layout: {
      accentColor:
        typeof rawLayout.accentColor === 'string' && /^#[0-9a-f]{6}$/i.test(rawLayout.accentColor)
          ? rawLayout.accentColor
          : '#ed7376',
      workerRows: Number.isInteger(workerRows) ? Math.min(12, Math.max(4, workerRows)) : 7,
      materialRows: Number.isInteger(materialRows) ? Math.min(18, Math.max(5, materialRows)) : 13,
      filenameTemplate:
        typeof rawLayout.filenameTemplate === 'string' && rawLayout.filenameTemplate.trim()
          ? rawLayout.filenameTemplate.trim().slice(0, 240)
          : '{projectNumber} - {projectName} - {materialTypes}',
      labels: Object.fromEntries(
        Object.entries(rawLabels)
          .filter(([, label]) => typeof label === 'string')
          .map(([key, label]) => [key, String(label).trim().slice(0, 80)]),
      ),
      sections: Object.fromEntries(
        Object.entries(rawSections)
          .filter(([, visible]) => typeof visible === 'boolean'),
      ) as Record<string, boolean>,
    },
  };
}

function pdfBuilderLabel(
  config: WorkOrderPdfBuilderConfig | undefined,
  key: string,
  fallback: string,
) {
  return config?.layout?.labels?.[key]?.trim() || fallback;
}

function pdfBuilderSectionVisible(
  config: WorkOrderPdfBuilderConfig | undefined,
  key: string,
) {
  return config?.layout?.sections?.[key] !== false;
}

function pdfColorFromHex(value: string | undefined): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value || '');
  return match
    ? [Number.parseInt(match[1], 16) / 255, Number.parseInt(match[2], 16) / 255, Number.parseInt(match[3], 16) / 255]
    : [0.929, 0.451, 0.463];
}

function mappedPdfField(
  data: Record<string, unknown>,
  config: WorkOrderPdfBuilderConfig | undefined,
  slot: string,
) {
  const fieldId = config?.fields?.[slot]?.trim();
  return fieldId ? { configured: true, value: data[fieldId] } : { configured: false, value: undefined };
}

function mappedPdfValue(
  data: Record<string, unknown>,
  config: WorkOrderPdfBuilderConfig | undefined,
  slot: string,
  fallback: unknown,
) {
  const mapped = mappedPdfField(data, config, slot);
  return mapped.configured ? mapped.value ?? '' : fallback;
}

function generatedPdfFileName(
  submissionId: string,
  context: WorkOrderPdfContext | null,
  builderConfig?: WorkOrderPdfBuilderConfig,
): string {
  const safeSubmissionId = basename(submissionId).replace(
    /[^a-zA-Z0-9_-]/g,
    '_',
  );
  if (!context) return `${safeSubmissionId}.pdf`;

  const plannedMaterials = Array.isArray(context.shift?.plannedMaterials)
    ? context.shift.plannedMaterials
        .map(recordValue)
        .filter((resource): resource is Record<string, unknown> => resource !== null)
    : [];
  const materialTypes = [
    ...context.materials.map((material) => material.type || ''),
    ...plannedMaterials.map((resource) => String(resource.type || '')),
  ]
    .map((value) => value.trim())
    .filter(
      (value, index, values) =>
        values.findIndex(
          (candidate) => candidate.toLowerCase() === value.toLowerCase(),
        ) === index,
    );
  const filenameTemplate =
    builderConfig?.layout?.filenameTemplate ||
    '{projectNumber} - {projectName} - {materialTypes}';
  const filenameTokens: Record<string, string> = {
    projectNumber: context.project?.number || context.project?.id || '',
    projectName: context.project?.name || '',
    materialTypes: materialTypes.join(' - '),
    workOrderNumber: context.workOrder?.orderNumber || '',
    shiftDate: String(context.shift?.date || ''),
  };
  const requestedName = filenameTemplate
    .replace(/\{(projectNumber|projectName|materialTypes|workOrderNumber|shiftDate)\}/g, (_match, token) => filenameTokens[token] || '')
    .replace(/\s+-\s+(?=-|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const safeName = requestedName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
    .slice(0, 170)
    .trim();
  return `${safeName || safeSubmissionId}.pdf`;
}

export function findWorkOrderFooterSignatures(
  data: Record<string, unknown>,
  template: FormTemplate | null,
  workers: WorkOrderPdfWorker[] = [],
  builderConfig?: WorkOrderPdfBuilderConfig,
) {
  const mappedLead = mappedPdfField(data, builderConfig, 'leadSignature');
  const mappedCustomer = mappedPdfField(data, builderConfig, 'customerSignature');
  const foremanSignature = mappedLead.configured
    ? mappedLead.value
    : findSignatureValue(data, template, [
      /foreman/,
      /lead/,
      /worker/,
      /employee/,
      /dr.?traffic.*rep/,
      /rep.*dr.?traffic/,
    ]) ||
    workers.find(
      (worker) =>
        /\b(lead|foreman|supervisor|manager|superintendent)\b/i.test(
          worker.roleName,
        ) && worker.signature,
    )?.signature;
  const customerCandidate = mappedCustomer.configured
    ? mappedCustomer.value
    : findSignatureValue(data, template, [
        /customer/,
        /contract/,
        /owner/,
        /general/,
        /approval/,
      ]);
  const foremanFingerprint = signatureFingerprint(foremanSignature);
  const customerFingerprint = signatureFingerprint(customerCandidate);
  const customerSignature =
    foremanFingerprint &&
    customerFingerprint &&
    foremanFingerprint === customerFingerprint
      ? null
      : customerCandidate;

  return { foremanSignature, customerSignature };
}

export const WORK_ORDER_PDF_TYPE_LABELS = [
  'Field Service',
  'Internal Sale',
  'Sales',
  'On Rent',
  'Off Rent',
] as const;

function normalizeWorkOrderPdfType(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

export function workOrderPdfTypeChecks(
  workOrderTypes: string[],
  materialTypes: string[] = [],
) {
  const selectedTypes = new Set(
    [...workOrderTypes, ...materialTypes]
      .map(normalizeWorkOrderPdfType)
      .filter(Boolean),
  );
  return WORK_ORDER_PDF_TYPE_LABELS.map((label) => ({
    label,
    checked: selectedTypes.has(normalizeWorkOrderPdfType(label)),
  }));
}

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
  builderConfig?: WorkOrderPdfBuilderConfig,
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
  const companyName = context.company?.name || 'DR Traffic Control, LLC';
  const companyAddress = context.company?.address || '2285 Revere Ave, San Francisco, CA 94124, USA';
  const companyPhone = context.company?.phone || '415-441-4410';
  const companyEmail = context.company?.email || 'info@drtrafficcontrol.com';
  const dateValue = mappedPdfValue(data, builderConfig, 'workDate',
    fieldValue(data, ['work_date', 'workDate', 'date']) ||
    shiftRecord.date ||
    submittedAt.toISOString().slice(0, 10));
  const jobNumber = mappedPdfValue(data, builderConfig, 'jobNumber',
    fieldValue(data, ['dr_traffic_job_number', 'drTrafficJobNumber']) ||
    project?.number ||
    workOrder?.orderNumber ||
    submission.projectId);
  const jobName = mappedPdfValue(data, builderConfig, 'jobName',
    fieldValue(data, ['job_name', 'jobName']) ||
    project?.name ||
    workOrder?.title ||
    submission.workOrderId);
  const description = mappedPdfValue(data, builderConfig, 'description',
    fieldValue(data, ['description_of_work', 'descriptionOfWork']) ||
    project?.description ||
    workOrder?.dispatchNote ||
    workOrder?.notes);
  const client = mappedPdfValue(data, builderConfig, 'client',
    fieldValue(data, ['client']) || clientRecord?.name || '');
  const contact = mappedPdfValue(data, builderConfig, 'contact',
    fieldValue(data, ['contact']) ||
    clientRecord?.contactName ||
    workOrder?.requesterName ||
    '');
  const customerOrder = mappedPdfValue(data, builderConfig, 'customerOrderNumber',
    fieldValue(data, ['customer_order_number', 'customerOrderNumber']) ||
    project?.purchaseOrder ||
    '');
  const shift = mappedPdfValue(data, builderConfig, 'workShift',
    fieldValue(data, ['work_shift', 'workShift']) ||
    shiftRecord.shiftTypeName ||
    shiftRecord.shiftName ||
    '');
  const defaultNotes = [
    fieldValue(data, ['extra_work_details', 'extraWorkDetails']),
    fieldValue(data, ['notes']),
    workOrder?.notes,
  ]
    .filter((value) => String(value ?? '').trim())
    .join(' | ');
  const notes = mappedPdfValue(data, builderConfig, 'notes', defaultNotes);
  const displayNumber = mappedPdfValue(data, builderConfig, 'workOrderNumber',
    workOrder?.orderNumber ||
    fieldValue(data, ['work_order_number', 'workOrderNumber']) ||
    submission.workOrderId ||
    compactId(submission.id, 16));
  const left = 17.64;
  const width = 576.72;
  const accent = pdfColorFromHex(builderConfig?.layout?.accentColor);
  const showHeader = pdfBuilderSectionVisible(builderConfig, 'header');
  const showTypes = pdfBuilderSectionVisible(builderConfig, 'types');
  const showLabor = pdfBuilderSectionVisible(builderConfig, 'labor');
  const showEquipment = pdfBuilderSectionVisible(builderConfig, 'equipment');
  const showMaterials = pdfBuilderSectionVisible(builderConfig, 'materials');
  const showNotes = pdfBuilderSectionVisible(builderConfig, 'notes');
  const showSignatures = pdfBuilderSectionVisible(builderConfig, 'signatures');
  const ops: string[] = ['0.75 w', '0 0 0 RG', pdfRect(0.75, 0.75, 610.5, 790.5)];

  // Exact geometry from the supplied HTML/CSS Letter template.
  if (showHeader && logo) ops.push('q 160.56 0 0 53.52 39.24 679.48 cm /Logo Do Q');
  const documentTitle = fitText(
    pdfBuilderLabel(builderConfig, 'documentTitle', 'WORK ORDER'),
    24,
  );
  const documentTitleSize = Math.max(
    7,
    Math.min(12, 150 / Math.max(1, documentTitle.length * 0.55)),
  );
  const documentTitleX =
    365 - (documentTitle.length * documentTitleSize * 0.52) / 2;
  if (showHeader) ops.push(pdfText(documentTitle, documentTitleX, 711.8, documentTitleSize, 'F2'));
  ops.push('0.835 0 0 rg');
  if (showHeader) ops.push(pdfText(`${pdfBuilderLabel(builderConfig, 'number', 'No.')}  ${compactId(displayNumber, 18)}`, 470, 711.8, 11, 'F2'));
  ops.push('0 0 0 rg');
  ops.push('0.835 0 0 rg');
  if (showHeader) ops.push(pdfText(fitText(companyName, 42), 226, 666.5, 12, 'F2'));
  ops.push('0 0 0 rg');
  if (showHeader) {
    ops.push(pdfText(fitText(companyAddress, 70), 218, 655, 6, 'F2'));
    ops.push(pdfText('CSLB #1099211            www.drtrafficcontrol.com', 222, 646.5, 6, 'F2'));
    ops.push(pdfText(`Phone: ${fitText(companyPhone, 22)}        ${fitText(companyEmail, 38)}`, 219, 638, 6, 'F2'));
  }

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

  drawTopCell(pdfBuilderLabel(builderConfig, 'jobNumber', 'DR TRAFFIC JOB#'), jobNumber, left, top, topWidths[0], 15.75, 34);
  drawTopCell(pdfBuilderLabel(builderConfig, 'jobName', 'JOB NAME:'), jobName, left + topWidths[0], top, topWidths[1], 15.75, 31);
  drawTopCell(pdfBuilderLabel(builderConfig, 'workDate', 'DATE:'), dateValue, left + topWidths[0] + topWidths[1], top, topWidths[2], 15.75, 24);
  top -= 15.75;
  drawTopCell(pdfBuilderLabel(builderConfig, 'description', 'DESCRIPTION OF WORK:'), description, left, top, width, 16.5, 116);
  top -= 16.5;
  drawTopCell(pdfBuilderLabel(builderConfig, 'client', 'CLIENT:'), client, left, top, topWidths[0] + topWidths[1], 15.75, 72);
  drawTopCell(
    pdfBuilderLabel(builderConfig, 'customerOrderNumber', 'CUSTOMER ORDER #'),
    customerOrder,
    left + topWidths[0] + topWidths[1],
    top,
    topWidths[2],
    15.75,
    31,
  );
  top -= 15.75;
  drawTopCell(pdfBuilderLabel(builderConfig, 'contact', 'CONTACT:'), contact, left, top, topWidths[0] + topWidths[1], 15.75, 72);
  const shiftX = left + topWidths[0] + topWidths[1];
  ops.push(pdfRect(shiftX, top - 15.75, topWidths[2], 15.75));
  ops.push(pdfText(pdfBuilderLabel(builderConfig, 'workShift', 'WORK SHIFT'), shiftX + 2, top - 5.5, 5.25, 'F2'));
  ops.push(pdfText(fitText(shift, 30) || '-', shiftX + 2, top - 12, 6));
  top -= 15.75;

  const mappedTypes = mappedPdfField(data, builderConfig, 'workOrderTypes');
  const typeChecks = mappedTypes.configured
    ? workOrderPdfTypeChecks(
        Array.isArray(mappedTypes.value)
          ? mappedTypes.value.filter((value): value is string => typeof value === 'string')
          : [],
      )
    : workOrderPdfTypeChecks(
        context.workOrderTypes,
        context.materials
          .map((material) => material.type || '')
          .filter(Boolean),
      );
  let checkX = left;
  const checkWidth = width / typeChecks.length;
  if (showTypes) typeChecks.forEach(({ label, checked }) => {
    ops.push(pdfRect(checkX, top - 16.5, checkWidth, 16.5));
    const fontSize = Math.max(4.4, Math.min(6.75, 42 / Math.max(6, label.length)));
    const labelAreaWidth = Math.max(10, checkWidth - 15);
    const visibleLabel = fitText(
      label.toUpperCase(),
      Math.max(5, Math.floor(labelAreaWidth / (fontSize * 0.52))),
    );
    const labelWidth = visibleLabel.length * fontSize * 0.52;
    const boxSize = 5;
    const contentX = checkX + Math.max(2, (labelAreaWidth - labelWidth) / 2);
    const boxX = checkX + checkWidth - boxSize - 4;
    const baselineY = top - 10.5;
    ops.push(
      pdfText(visibleLabel, contentX, baselineY, fontSize, 'F2'),
    );
    ops.push(pdfRect(boxX, baselineY - 1, boxSize, boxSize));
    if (checked) {
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
  if (showLabor) {
    ops.push(pdfText(pdfBuilderLabel(builderConfig, 'labor', 'LABOR'), left + laborWidth / 2 - 13, top - 10, 6.75, 'F2'));
    ops.push(pdfText(pdfBuilderLabel(builderConfig, 'hours', 'HOURS'), left + laborWidth + hoursWidth / 2 - 14, top - 10, 6.75, 'F2'));
  }
  if (showEquipment) ops.push(pdfText(pdfBuilderLabel(builderConfig, 'equipment', 'EQUIPMENT'), left + laborWidth + hoursWidth + equipmentWidth / 2 - 20, top - 10, 6.75, 'F2'));
  top -= sectionHeight;

  const workHeaders = [
    showLabor ? pdfBuilderLabel(builderConfig, 'employeeName', 'EMPLOYEE NAME') : '',
    showLabor ? pdfBuilderLabel(builderConfig, 'start', 'START') : '',
    showLabor ? pdfBuilderLabel(builderConfig, 'end', 'END') : '',
    showLabor ? pdfBuilderLabel(builderConfig, 'regularHours', 'REG') : '',
    showLabor ? pdfBuilderLabel(builderConfig, 'overtimeHours', 'OT') : '',
    showLabor ? pdfBuilderLabel(builderConfig, 'doubleTimeHours', 'DT') : '',
    showEquipment ? pdfBuilderLabel(builderConfig, 'equipmentId', 'EQUIP ID') : '',
    showEquipment ? pdfBuilderLabel(builderConfig, 'equipmentDescription', 'EQUIP DESCRIPTION') : '',
    showEquipment ? pdfBuilderLabel(builderConfig, 'equipmentHours', 'HRS') : '',
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

  const rowCount = builderConfig?.layout?.workerRows ?? 7;
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

    if (showLabor) ops.push(pdfText('Name', left + 2, personBaseline, 5.25, 'F2'));
    if (showLabor) ops.push(pdfText('SHIFT', left + firstColumnSplit + 2, personBaseline, 5.25, 'F2'));
    if (showLabor) ops.push(pdfText('Sign', left + 2, signBaseline, 5.25, 'F2'));
    if (showLabor) ops.push(pdfText('Lunch:', left + firstColumnSplit + 2, signBaseline, 5.25, 'F2'));
    if (showLabor) ops.push(pdfRect(breakAreaX + breakParts[0] / 2 - 2.5, signBaseline - 1, 5, 5));
    if (showLabor) ops.push(pdfText('Breaks:', breakAreaX + breakParts[0] + 3, signBaseline, 5.25, 'F2'));
    if (showLabor) ops.push(
      pdfRect(
        breakAreaX + breakParts[0] + breakParts[1] + breakParts[2] / 2 - 2.5,
        signBaseline - 1,
        5,
        5,
      ),
    );

    if (showLabor && worker) {
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
      ops.push(pdfText(stringifyFieldValue(equipment.description), workXs[7] + 2, baseline, 5.2));
    };
    if (showEquipment) {
      drawEquipment(equipmentTop, personBaseline);
      drawEquipment(equipmentBottom, signBaseline);
    }

    if (showLabor && worker) {
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

  const materialPercentages = [30, 13.7, 6.9, 49.4];
  const materialCols = materialPercentages.map((percentage) => (width * percentage) / 100);
  const materialXs: number[] = [];
  let materialX = left;
  materialCols.forEach((columnWidth) => {
    materialXs.push(materialX);
    materialX += columnWidth;
  });
  const materialWidth = materialCols.slice(0, 3).reduce((sum, value) => sum + value, 0);
  ops.push(pdfFillRect(left, top - sectionHeight, materialWidth, sectionHeight, accent));
  ops.push(pdfFillRect(left + materialWidth, top - sectionHeight, materialCols[3], sectionHeight, accent));
  ops.push(pdfRect(left, top - sectionHeight, materialWidth, sectionHeight));
  ops.push(pdfRect(left + materialWidth, top - sectionHeight, materialCols[3], sectionHeight));
  if (showMaterials) ops.push(pdfText(pdfBuilderLabel(builderConfig, 'materials', 'MATERIAL'), left + materialWidth / 2 - 16, top - 10, 6.75, 'F2'));
  if (showNotes) ops.push(pdfText(pdfBuilderLabel(builderConfig, 'notes', 'NOTES'), left + materialWidth + materialCols[3] / 2 - 11, top - 10, 6.75, 'F2'));
  top -= sectionHeight;

  const materialHeaders = [
    showMaterials ? pdfBuilderLabel(builderConfig, 'materialDescription', 'DESCRIPTION') : '',
    showMaterials ? pdfBuilderLabel(builderConfig, 'materialType', 'TYPE') : '',
    showMaterials ? pdfBuilderLabel(builderConfig, 'materialQuantity', 'QTY') : '',
    '',
  ];
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

  const materialRowCount = builderConfig?.layout?.materialRows ?? 13;
  const materialRowHeight = 165.75 / materialRowCount;
  const allNoteLines = wrapText(stringifyFieldValue(notes), 58);
  const noteLines = allNoteLines.slice(0, materialRowCount);
  for (let index = 0; index < materialRowCount; index += 1) {
    const material = context.materials[index];
    materialCols.forEach((columnWidth, columnIndex) => {
      ops.push(pdfRect(materialXs[columnIndex], top - materialRowHeight, columnWidth, materialRowHeight));
    });
    if (showMaterials && material) {
      const materialType = fitPdfTextToWidth(material.type || '', materialCols[1] - 4, 5.2);
      ops.push(pdfText(fitText(material.description, 34), materialXs[0] + 2, top - 8.7, 5.2));
      ops.push(pdfText(materialType.text, materialXs[1] + 2, top - 8.7, materialType.size));
      ops.push(pdfText(fitText(material.quantity || '', 8), materialXs[2] + 2, top - 8.7, 5.2));
    }
    if (showNotes && noteLines[index]) {
      ops.push(pdfText(fitText(noteLines[index], 58), materialXs[3] + 2, top - 8.7, 5.2));
    }
    top -= materialRowHeight;
  }

  const { foremanSignature, customerSignature } =
    findWorkOrderFooterSignatures(data, template, context.workers, builderConfig);

  const footerY = 88;
  if (showSignatures) ops.push(pdfText(pdfBuilderLabel(builderConfig, 'leadSignature', 'DR TRAFFIC REP. (NAME)'), left + 2, footerY, 5.6, 'F2'));
  if (showSignatures) ops.push(pdfLine(left + 101, footerY - 1, left + 247, footerY - 1));
  if (showSignatures) ops.push(
    pdfText(
      pdfBuilderLabel(builderConfig, 'customerSignature', 'OWNER / GENERAL CONTRACTOR REP. (NAME)'),
      left + 288,
      footerY,
      5.6,
      'F2',
    ),
  );
  if (showSignatures) ops.push(pdfLine(left + 464, footerY - 1, left + 574, footerY - 1));
  if (showSignatures && foremanSignature) {
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
  if (showSignatures && customerSignature) {
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
  if (showSignatures) ops.push(
    pdfText(
      'I hereby acknowledge the satisfactory completion of the above described work and accept the Terms &',
      left + 288,
      footerY - 10,
      4.6,
    ),
  );
  if (showSignatures) ops.push(pdfText('Conditions on the reverse side.', left + 288, footerY - 16, 4.6));

  const continuationPages: string[] = [];
  const addContinuationHeader = (pageOps: string[], title: string) => {
    pageOps.push('0.65 w', '0 0 0 RG', pdfRect(17.64, 22, width, 748));
    if (logo) pageOps.push('q 105 0 0 35 30 724 cm /Logo Do Q');
    pageOps.push(pdfText(title, 220, 744, 11, 'F2'));
    pageOps.push(pdfText(`WORK ORDER ${compactId(displayNumber, 20)}`, 220, 729, 8, 'F2'));
    pageOps.push(pdfText(`${fitText(jobNumber, 28)} - ${fitText(jobName, 48)}`, 220, 716, 7));
  };

  if (showLabor || showEquipment) {
    const remainingWorkers = context.workers.slice(rowCount);
    const remainingEquipment = context.equipment.slice(rowCount * 2);
    const totalContinuationRows = Math.max(
      remainingWorkers.length,
      Math.ceil(remainingEquipment.length / 2),
    );
    const rowsPerPage = 13;
    for (let offset = 0; offset < totalContinuationRows; offset += rowsPerPage) {
      const pageOps: string[] = [];
      addContinuationHeader(pageOps, 'LABOR & EQUIPMENT - CONTINUED');
      const tableTop = 690;
      const headers = [
        pdfBuilderLabel(builderConfig, 'employeeName', 'EMPLOYEE NAME'),
        'SIGNATURE',
        pdfBuilderLabel(builderConfig, 'start', 'START'),
        pdfBuilderLabel(builderConfig, 'end', 'END'),
        pdfBuilderLabel(builderConfig, 'regularHours', 'REG'),
        pdfBuilderLabel(builderConfig, 'overtimeHours', 'OT'),
        pdfBuilderLabel(builderConfig, 'doubleTimeHours', 'DT'),
        pdfBuilderLabel(builderConfig, 'equipment', 'EQUIPMENT'),
      ];
      const widths = [150, 100, 48, 48, 35, 35, 35, 125];
      const xs: number[] = [];
      let currentX = left;
      widths.forEach((columnWidth) => {
        xs.push(currentX);
        currentX += columnWidth;
      });
      widths.forEach((columnWidth, index) => {
        pageOps.push(pdfFillRect(xs[index], tableTop - 20, columnWidth, 20, accent));
        pageOps.push(pdfRect(xs[index], tableTop - 20, columnWidth, 20));
        pageOps.push(pdfText(headers[index], xs[index] + 3, tableTop - 13, 5.8, 'F2'));
      });
      let rowTop = tableTop - 20;
      for (let rowIndex = 0; rowIndex < rowsPerPage; rowIndex += 1) {
        const absoluteIndex = offset + rowIndex;
        const worker = remainingWorkers[absoluteIndex];
        const equipmentA = remainingEquipment[absoluteIndex * 2];
        const equipmentB = remainingEquipment[absoluteIndex * 2 + 1];
        if (!worker && !equipmentA && !equipmentB) break;
        const rowHeight = 46;
        widths.forEach((columnWidth, index) => {
          pageOps.push(pdfRect(xs[index], rowTop - rowHeight, columnWidth, rowHeight));
        });
        if (showLabor && worker) {
          pageOps.push(pdfText(fitText(worker.workerName, 28), xs[0] + 3, rowTop - 15, 7, 'F2'));
          pageOps.push(pdfText(fitText(worker.roleName, 28), xs[0] + 3, rowTop - 29, 5.5));
          pageOps.push(pdfText(formatPdfClock(worker.startTime), xs[2] + 3, rowTop - 20, 6));
          pageOps.push(pdfText(formatPdfClock(worker.endTime), xs[3] + 3, rowTop - 20, 6));
          pageOps.push(pdfText(String(worker.regularHours || 0), xs[4] + 10, rowTop - 20, 6));
          pageOps.push(pdfText(String(worker.overtimeHours || 0), xs[5] + 10, rowTop - 20, 6));
          pageOps.push(pdfText(String(worker.doubleTimeHours || 0), xs[6] + 10, rowTop - 20, 6));
          if (worker.signature) {
            drawSignature(pageOps, images, worker.signature, xs[1] + 3, rowTop - rowHeight + 3, widths[1] - 6, rowHeight - 6);
          }
        }
        if (showEquipment) {
          const equipmentLines = [equipmentA, equipmentB]
            .filter((item): item is WorkOrderPdfResource => Boolean(item));
          equipmentLines.forEach((item, lineIndex) => {
            const lineY = rowTop - 11 - lineIndex * 22;
            pageOps.push(pdfText(stringifyFieldValue(item.identifier), xs[7] + 3, lineY, 5.2, 'F2'));
            pageOps.push(pdfText(stringifyFieldValue(item.description), xs[7] + 3, lineY - 8, 5));
          });
        }
        rowTop -= rowHeight;
      }
      continuationPages.push(pageOps.join('\n'));
    }
  }

  if (showMaterials) {
    const remainingMaterials = context.materials.slice(materialRowCount);
    const rowsPerPage = 32;
    for (let offset = 0; offset < remainingMaterials.length; offset += rowsPerPage) {
      const pageOps: string[] = [];
      addContinuationHeader(pageOps, 'MATERIALS - CONTINUED');
      const tableTop = 690;
      const widths = [330, 150, 96];
      const xs = [left, left + widths[0], left + widths[0] + widths[1]];
      [
        pdfBuilderLabel(builderConfig, 'materialDescription', 'DESCRIPTION'),
        pdfBuilderLabel(builderConfig, 'materialType', 'TYPE'),
        pdfBuilderLabel(builderConfig, 'materialQuantity', 'QTY'),
      ].forEach((header, index) => {
        pageOps.push(pdfFillRect(xs[index], tableTop - 20, widths[index], 20, accent));
        pageOps.push(pdfRect(xs[index], tableTop - 20, widths[index], 20));
        pageOps.push(pdfText(header, xs[index] + 4, tableTop - 13, 6, 'F2'));
      });
      let rowTop = tableTop - 20;
      remainingMaterials.slice(offset, offset + rowsPerPage).forEach((material) => {
        const rowHeight = 18;
        const materialType = fitPdfTextToWidth(material.type || '', widths[1] - 8, 6);
        widths.forEach((columnWidth, index) => pageOps.push(pdfRect(xs[index], rowTop - rowHeight, columnWidth, rowHeight)));
        pageOps.push(pdfText(fitText(material.description, 58), xs[0] + 4, rowTop - 12, 6));
        pageOps.push(pdfText(materialType.text, xs[1] + 4, rowTop - 12, materialType.size));
        pageOps.push(pdfText(fitText(material.quantity || '', 12), xs[2] + 4, rowTop - 12, 6));
        rowTop -= rowHeight;
      });
      continuationPages.push(pageOps.join('\n'));
    }
  }

  if (showNotes) {
    const remainingNoteLines = allNoteLines.slice(materialRowCount);
    const linesPerPage = 48;
    for (let offset = 0; offset < remainingNoteLines.length; offset += linesPerPage) {
      const pageOps: string[] = [];
      addContinuationHeader(pageOps, 'NOTES - CONTINUED');
      pageOps.push(pdfFillRect(left, 670, width, 20, accent));
      pageOps.push(pdfRect(left, 670, width, 20));
      pageOps.push(pdfText(pdfBuilderLabel(builderConfig, 'notes', 'NOTES'), left + 5, 677, 7, 'F2'));
      let lineY = 652;
      remainingNoteLines.slice(offset, offset + linesPerPage).forEach((line) => {
        pageOps.push(pdfText(line, left + 6, lineY, 7));
        lineY -= 13;
      });
      continuationPages.push(pageOps.join('\n'));
    }
  }

  return buildPdfContentPages([ops.join('\n'), ...continuationPages], images);
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
    private readonly shiftWorkOrderAccess: ShiftWorkOrderAccessService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  buildPdfBuilderPreview(rawConfig: unknown): Buffer {
    const builderConfig = normalizedPdfBuilderConfig(rawConfig);
    const sampleSignature = {
      type: 'signature-path',
      width: 600,
      height: 220,
      strokes: [[
        { x: 40, y: 150 }, { x: 120, y: 70 }, { x: 190, y: 145 },
        { x: 270, y: 55 }, { x: 350, y: 140 }, { x: 510, y: 85 },
      ]],
    };
    const sampleCustomerSignature = {
      ...sampleSignature,
      strokes: [[
        { x: 50, y: 130 }, { x: 150, y: 60 }, { x: 240, y: 135 },
        { x: 330, y: 65 }, { x: 500, y: 120 },
      ]],
    };
    const samples: Record<string, unknown> = {
      workOrderNumber: 'ASN-2026-001',
      jobNumber: '23',
      jobName: '2399 - Folsom Street',
      workDate: '2026-08-02',
      description: 'Traffic control services and field operations',
      client: 'Sample Customer',
      customerOrderNumber: 'PO-10025',
      contact: 'Project Contact',
      workShift: 'On Call',
      workOrderTypes: ['Sales', 'On Rent', 'Off Rent'],
      notes: 'PDF Builder preview generated with representative mapped data.',
      leadSignature: sampleSignature,
      customerSignature: sampleCustomerSignature,
    };
    const data: Record<string, unknown> = {};
    for (const [slot, fieldId] of Object.entries(builderConfig.fields || {})) {
      if (fieldId && slot in samples) data[fieldId] = samples[slot];
    }
    const submission = {
      id: 'pdf-builder-preview',
      submittedAt: new Date('2026-08-02T12:00:00Z'),
      workOrderId: 'preview-work-order',
      projectId: 'preview-project',
      shiftId: 'preview-shift',
      data,
    } as FormSubmission;
    const context: WorkOrderPdfContext = {
      workOrder: { orderNumber: 'ASN-2026-001' } as WorkOrder,
      project: { id: 'preview-project', number: '23', name: '2399 - Folsom Street' } as Project,
      client: { name: 'Sample Customer', contactName: 'Project Contact' } as Client,
      workers: [{
        workerId: 'preview-worker',
        workerName: 'Fernando Perez',
        roleName: 'Lead',
        startTime: '7:00 AM',
        endTime: '4:00 PM',
        regularHours: 8,
        overtimeHours: 0.5,
        doubleTimeHours: 0,
        lunchTaken: true,
        breakMinutes: 30,
        signature: sampleSignature,
      }],
      equipment: [{ identifier: '03_05', description: 'Mini Maxi', hours: '8.5' }],
      materials: [
        { identifier: '1110', description: '1110 - Butyl Pads', type: 'Sales', quantity: '1' },
        { identifier: '488', description: '488 - Paint', type: 'On Rent', quantity: '1' },
        { identifier: '489', description: '489 - Spray Paint', type: 'Off Rent', quantity: '1' },
      ],
      workOrderTypes: [],
      shift: { date: '2026-08-02', shiftName: 'On Call' },
    };
    return buildWorkOrderPdf(submission, null, context, builderConfig);
  }

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

  async regeneratePdf(id: string, actor?: UserAccessContext) {
    const submission = await this.findOne(id);
    const template = submission.templateId
      ? await this.templatesRepo.findOne({ where: { id: submission.templateId } })
      : null;
    if (!isWorkOrderTemplate(template)) {
      throw new BadRequestException('Only Work Order form PDFs can be regenerated.');
    }
    await this.shiftWorkOrderAccess.assertCanManageShiftWorkOrder(
      actor,
      submission.workOrderId,
      submission.shiftId,
    );
    const previousPdfUrl = submission.pdfUrl;
    submission.pdfUrl = await this.generatePdf(submission, template);
    const saved = await this.repo.save(submission);
    if (previousPdfUrl && previousPdfUrl !== saved.pdfUrl) {
      await this.deleteGeneratedPdf(previousPdfUrl);
    }
    this.realtime.emitTableUpdated('form_submissions');
    return saved;
  }

  async create(dto: CreateFormSubmissionDto, actor?: UserAccessContext) {
    const template = dto.templateId
      ? await this.templatesRepo.findOne({ where: { id: dto.templateId } })
      : null;
    let canManageShiftWorkOrder = false;
    if (isWorkOrderTemplate(template)) {
      await this.shiftWorkOrderAccess.assertCanManageShiftWorkOrder(
        actor,
        dto.workOrderId,
        dto.shiftId,
      );
      canManageShiftWorkOrder = true;
    } else if (template) {
      canManageShiftWorkOrder =
        await this.shiftWorkOrderAccess.canManageShiftWorkOrder(
          actor,
          dto.workOrderId,
          dto.shiftId,
        );
    }
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
        {
          mobileRole: this.mobileValidationRole(template, actor),
          canManageShiftWorkOrder,
        },
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
    let canManageShiftWorkOrder = false;
    if (isWorkOrderTemplate(template)) {
      await this.shiftWorkOrderAccess.assertCanManageShiftWorkOrder(
        actor,
        dto.workOrderId || item.workOrderId,
        dto.shiftId || item.shiftId,
      );
      canManageShiftWorkOrder = true;
    } else if (template) {
      canManageShiftWorkOrder =
        await this.shiftWorkOrderAccess.canManageShiftWorkOrder(
          actor,
          dto.workOrderId || item.workOrderId,
          dto.shiftId || item.shiftId,
        );
    }
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
        {
          mobileRole: this.mobileValidationRole(template, actor),
          canManageShiftWorkOrder,
        },
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
    const worker = await findWorkerForActor(this.workersRepo, actor);
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
      sourceSubmissionId: submission.id,
      variants: ['client', 'internal'],
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
        variants: ['client', 'internal'],
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
    builderConfig?: WorkOrderPdfBuilderConfig,
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
    const submissionData = submission.data ?? {};
    const mappedWorkers = mappedPdfField(submissionData, builderConfig, 'workers');
    const mappedEquipment = mappedPdfField(submissionData, builderConfig, 'equipment');
    const mappedMaterials = mappedPdfField(submissionData, builderConfig, 'materials');
    const workerSource = mappedWorkers.configured
      ? { selected: mappedWorkers.value }
      : submissionData;
    const equipmentSource = mappedEquipment.configured
      ? { selected: mappedEquipment.value }
      : submissionData;
    const materialSource = mappedMaterials.configured
      ? { selected: mappedMaterials.value }
      : submissionData;
    const submittedTimesheetRows = findTimesheetRows(workerSource);
    const submittedEquipmentRows = findResourceRows(equipmentSource, 'equipmentId');
    const submittedMaterialResourceRows = findResourceRows(materialSource, 'materialId');
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
    }

    // Fallback: when the work order has no rows in the relational shift
    // tables (new WO created with shifts:[] before the user added a shift),
    // harvest workers from the submission form data.
    if (workerIds.length === 0) {
      for (const row of submittedTimesheetRows) {
        const workerId = String(row.workerId ?? '').trim();
        if (workerId && !workerIds.includes(workerId)) {
          workerIds.push(workerId);
        }
      }
    }
    for (const row of submittedEquipmentRows) {
      const equipmentId = String(row.equipmentId ?? '').trim();
      if (equipmentId && !equipmentIds.includes(equipmentId)) equipmentIds.push(equipmentId);
    }
    for (const row of submittedMaterialResourceRows) {
      const materialId = String(row.materialId ?? '').trim();
      if (materialId && !materialIds.includes(materialId)) materialIds.push(materialId);
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
                variant: 'client',
              },
            })
          : Promise.resolve([]),
      ]);

    const submittedRows = submittedTimesheetRows;
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
      fieldValue(submissionData, [
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
    const catalogMaterials = materialIds.map((materialId) => {
      const item = materialsById.get(materialId);
      return {
        identifier: item?.identifier || materialId,
        description:
          [item?.identifier, item?.name].filter(Boolean).join(' - ') ||
          materialId,
        type: item?.type || '',
        quantity: '1',
      };
    });
    const submittedMaterialRows = findPlannedMaterialUsageRows(materialSource);
    const submittedMaterialIds = new Set(submittedMaterialRows.map((row) => String(row.materialId ?? '').trim()).filter(Boolean));
    const submittedMaterials = submittedMaterialRows.map((row) => {
      const materialId = String(row.materialId ?? '').trim();
      const item = materialId ? materialsById.get(materialId) : undefined;
      return {
        identifier: item?.identifier || materialId,
        description: [item?.identifier, item?.name].filter(Boolean).join(' - ') || String(row.type ?? '').trim(),
        type: item?.type || String(row.type ?? '').trim(),
        quantity: String(Math.max(0, Number(row.actualQuantity) || 0)),
      };
    });
    const materials = [
      ...submittedMaterials,
      ...catalogMaterials.filter((_, index) => !submittedMaterialIds.has(materialIds[index])),
    ];

    return {
    workOrder,
      project,
      client,
      workers,
      equipment,
      materials,
      workOrderTypes: Array.isArray(shift?.workOrderTypes)
        ? shift.workOrderTypes.filter(
            (value): value is string =>
              typeof value === 'string' && value.trim().length > 0,
          )
        : [],
      shift,
    };
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
        for (const line of wrapText(
          `${label}: ${stringifyFieldValue(value)}`,
        )) {
          lines.push(line);
        }
      }
    }

    const isWorkOrder = isWorkOrderTemplate(template);
    const settings = isWorkOrder
      ? (await this.companySettings.findAll())[0] ?? null
      : null;
    const savedBuilderConfig = normalizedPdfBuilderConfig(
      settings?.workOrderPdfBuilder,
    );
    const builderConfig =
      !savedBuilderConfig.templateId || savedBuilderConfig.templateId === template?.id
        ? savedBuilderConfig
        : undefined;
    const workOrderContext = isWorkOrder
      ? await this.loadWorkOrderPdfContext(submission, builderConfig)
      : null;
    if (workOrderContext && settings) {
      workOrderContext.company = {
        name: settings.name,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
      };
    }
    const fileName = generatedPdfFileName(
      submission.id,
      workOrderContext,
      builderConfig,
    );
    const pdf =
      isWorkOrder && workOrderContext
        ? buildWorkOrderPdf(submission, template, workOrderContext, builderConfig)
        : buildSimplePdf(lines.slice(0, 48));

    if (this.spacesStorage.isConfigured()) {
      const uploaded = await this.spacesStorage.uploadGeneratedWorkOrderPdf(
        {
          originalname: fileName,
          mimetype: 'application/pdf',
          buffer: pdf,
          size: pdf.length,
        },
        submission.workOrderId || submission.id,
        submission.id,
      );
      if (uploaded?.url) return uploaded.url;
    }

    const publicDir = resolve(process.cwd(), 'public', 'generated-form-pdfs');
    await mkdir(publicDir, { recursive: true });
    await writeFile(resolve(publicDir, fileName), pdf);
    return `/files/generated-form-pdfs/${fileName}`;
  }
}
