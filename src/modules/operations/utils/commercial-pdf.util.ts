import { CommercialInvoice } from '../../../entities/commercial-invoice.entity';
import { CommercialWorkOrder } from '../../../entities/commercial-work-order.entity';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { deflateSync, inflateSync } from 'zlib';

type PdfItem = Record<string, unknown>;
export type EmbeddedPdfImage = {
  name: string;
  width: number;
  height: number;
  data: Buffer;
  filter?: 'DCTDecode' | 'FlateDecode';
};

function pdfEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?');
}

function pdfText(
  value: unknown,
  x: number,
  y: number,
  size = 8,
  font: 'F1' | 'F2' = 'F1',
) {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(String(value ?? ''))}) Tj ET`;
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

function fitText(value: unknown, max = 32): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return `$${numberValue(value).toFixed(2)}`;
}

function formatDate(value: unknown) {
  if (!value) return '-';
  const text = String(value).slice(0, 10);
  const parts = text.split('-');
  if (parts.length !== 3) return text;
  return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

function readUInt32(buffer: Buffer, offset: number) {
  return buffer.readUInt32BE(offset);
}

function paethPredictor(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngForPdf(path: string, name: string): EmbeddedPdfImage | null {
  if (!existsSync(path)) return null;
  const buffer = readFileSync(path);
  if (buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = readUInt32(buffer, offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buffer.subarray(dataStart, dataStart + length);
    if (type === 'IHDR') {
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataStart + length + 4;
  }

  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType)) {
    return null;
  }

  const source = inflateSync(Buffer.concat(idatChunks));
  const sourceChannels = colorType === 6 ? 4 : 3;
  const bytesPerPixel = sourceChannels;
  const scanlineLength = width * sourceChannels;
  const rgbScanlineLength = width * 3;
  const rgb = Buffer.alloc(height * rgbScanlineLength);
  let sourceOffset = 0;
  let previous = Buffer.alloc(scanlineLength);

  for (let y = 0; y < height; y += 1) {
    const filter = source[sourceOffset];
    sourceOffset += 1;
    const scanline = Buffer.from(source.subarray(sourceOffset, sourceOffset + scanlineLength));
    sourceOffset += scanlineLength;

    for (let x = 0; x < scanlineLength; x += 1) {
      const left = x >= bytesPerPixel ? scanline[x - bytesPerPixel] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] || 0 : 0;
      if (filter === 1) {
        scanline[x] = (scanline[x] + left) & 0xff;
      } else if (filter === 2) {
        scanline[x] = (scanline[x] + up) & 0xff;
      } else if (filter === 3) {
        scanline[x] = (scanline[x] + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        scanline[x] = (scanline[x] + paethPredictor(left, up, upLeft)) & 0xff;
      }
    }

    for (let x = 0; x < width; x += 1) {
      const src = x * sourceChannels;
      const dst = y * rgbScanlineLength + x * 3;
      const alpha = colorType === 6 ? scanline[src + 3] / 255 : 1;
      rgb[dst] = Math.round(scanline[src] * alpha + 255 * (1 - alpha));
      rgb[dst + 1] = Math.round(scanline[src + 1] * alpha + 255 * (1 - alpha));
      rgb[dst + 2] = Math.round(scanline[src + 2] * alpha + 255 * (1 - alpha));
    }
    previous = scanline;
  }

  return {
    name,
    width,
    height,
    data: deflateSync(rgb),
    filter: 'FlateDecode',
  };
}

export function loadCommercialPdfLogoImage(
  name = 'Logo',
  fileName = 'drtraffic-logo-horizontal.png',
) {
  return decodePngForPdf(join(process.cwd(), 'public', fileName), name);
}

function buildPdf(content: string, images: EmbeddedPdfImage[] = []): Buffer {
  const objects: Array<string | Buffer> = [];
  const xObjectResources = images.length
    ? `/XObject << ${images.map((image, index) => `/${image.name} ${7 + index} 0 R`).join(' ')} >>`
    : '';
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> ${xObjectResources} >> /Contents 6 0 R >>`,
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
          `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${image.filter || 'FlateDecode'} /Length ${image.data.length} >>\nstream\n`,
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
  objects.forEach((object, index) => {
    offsets.push(length);
    const header = Buffer.from(`${index + 1} 0 obj\n`, 'utf8');
    const body = typeof object === 'string' ? Buffer.from(object, 'utf8') : object;
    const footer = Buffer.from('\nendobj\n', 'utf8');
    const block = Buffer.concat([header, body, footer]);
    parts.push(block);
    length += block.length;
  });

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

function tableHeader(
  ops: string[],
  y: number,
  columns: Array<{ label: string; x: number; w: number }>,
) {
  ops.push(pdfFillRect(40, y - 4, 532, 22, [0.08, 0.1, 0.14]));
  columns.forEach((column) => {
    ops.push(pdfText(column.label, column.x + 4, y + 3, 6.5, 'F2'));
  });
}

function sectionTitle(ops: string[], title: string, y: number) {
  ops.push(pdfText(title, 40, y, 10, 'F2'));
  ops.push(pdfLine(40, y - 6, 572, y - 6));
}

function renderBrandHeader(ops: string[], title: string, number: string, date: string) {
  ops.push('q 130 0 0 41 40 714 cm /Logo Do Q');
  ops.push(pdfText('DR Traffic Control', 245, 742, 11, 'F2'));
  ops.push(pdfText('456 Traffic Way', 245, 727, 8));
  ops.push(pdfText('San Jose, CA 95131', 245, 715, 8));
  ops.push(pdfText(title, 438, 742, 18, 'F2'));
  ops.push(pdfText(number, 438, 720, 17, 'F2'));
  ops.push(pdfText(`Date: ${formatDate(date)}`, 438, 696, 8));
  ops.push(pdfLine(40, 680, 572, 680));
}

export function buildCommercialWorkOrderPdf(workOrder: CommercialWorkOrder): Buffer {
  const ops: string[] = [];
  const logo = loadCommercialPdfLogoImage('Logo', 'drtraffic-work-order-logo.png');
  const isSale = workOrder.type === 'sale';
  renderBrandHeader(
    ops,
    isSale ? 'SALE WORK ORDER' : 'WORK ORDER',
    workOrder.workOrderNumber,
    workOrder.workDate || workOrder.onRentDate || '',
  );

  ops.push(pdfText('BILL TO:', 40, 650, 8, 'F2'));
  ops.push(pdfText(fitText(workOrder.customerName, 34), 40, 636, 9));
  ops.push(pdfText(fitText(workOrder.contact, 34), 40, 622, 8));
  ops.push(pdfText(fitText(workOrder.email, 34), 40, 608, 8));
  ops.push(pdfText('JOB NAME / LOCATION:', 245, 650, 8, 'F2'));
  ops.push(pdfText(fitText(workOrder.jobName, 34), 245, 636, 9));
  ops.push(pdfText(fitText(workOrder.jobNumber, 34), 245, 622, 8));
  ops.push(pdfText(isSale ? 'CUSTOMER ORDER #:' : 'ON RENT DATE:', 438, 650, 8, 'F2'));
  ops.push(pdfText(isSale ? workOrder.customerOrderNumber : formatDate(workOrder.onRentDate), 438, 636, 9));

  const columns = isSale
    ? [
        { label: 'SKU', x: 42, w: 72 },
        { label: 'DESCRIPTION', x: 116, w: 212 },
        { label: 'QTY', x: 334, w: 48 },
        { label: 'UNIT', x: 386, w: 50 },
        { label: 'PRICE', x: 440, w: 62 },
        { label: 'AMOUNT', x: 506, w: 64 },
      ]
    : [
        { label: 'SKU', x: 42, w: 66 },
        { label: 'DESCRIPTION', x: 112, w: 180 },
        { label: 'QTY', x: 296, w: 46 },
        { label: 'UNIT', x: 346, w: 52 },
        { label: 'DAILY RATE', x: 402, w: 70 },
        { label: 'DAYS', x: 476, w: 42 },
        { label: 'AMOUNT', x: 522, w: 50 },
      ];
  tableHeader(ops, 570, columns);
  let y = 548;
  const items = Array.isArray(workOrder.items) ? (workOrder.items as PdfItem[]) : [];
  let total = 0;
  items.slice(0, 14).forEach((item) => {
    const qty = isSale ? numberValue(item.qty) : numberValue(item.onRentQty);
    const unit = String(item.unit || 'Each');
    const rate = isSale ? numberValue(item.price) : numberValue(item.dailyRate);
    const days = numberValue(item.rentalDurationDays) || 28;
    const amount = isSale ? numberValue(item.amount) : qty * rate * days;
    total += amount;
    ops.push(pdfRect(40, y - 9, 532, 20));
    ops.push(pdfText(fitText(item.sku, 12), 46, y - 2, 7));
    ops.push(pdfText(fitText(item.description, isSale ? 38 : 30), 118, y - 2, 7));
    ops.push(pdfText(qty, isSale ? 342 : 306, y - 2, 7));
    ops.push(pdfText(fitText(unit, 8), isSale ? 392 : 352, y - 2, 7));
    ops.push(pdfText(money(rate), isSale ? 448 : 410, y - 2, 7));
    if (!isSale) ops.push(pdfText(days, 486, y - 2, 7));
    ops.push(pdfText(money(amount), isSale ? 514 : 524, y - 2, 7));
    y -= 20;
  });

  sectionTitle(ops, 'Notes', 230);
  ops.push(pdfRect(40, 146, 345, 68));
  ops.push(pdfText(fitText(workOrder.notes || workOrder.descriptionOfWork, 72), 48, 196, 8));
  ops.push(pdfRect(408, 166, 164, 48));
  ops.push(pdfText('SUBTOTAL', 420, 196, 8, 'F2'));
  ops.push(pdfText(money(total), 510, 196, 8, 'F2'));
  ops.push(pdfText('TAX (0%)', 420, 181, 8, 'F2'));
  ops.push(pdfText('$0.00', 510, 181, 8, 'F2'));
  ops.push(pdfFillRect(408, 146, 164, 20, [0.82, 0, 0]));
  ops.push(pdfText('TOTAL', 420, 153, 9, 'F2'));
  ops.push(pdfText(money(total), 510, 153, 9, 'F2'));
  ops.push(pdfText('Thank you for your business!', 236, 58, 9));
  return buildPdf(ops.join('\n'), logo ? [logo] : []);
}

export function buildCommercialInvoicePdf(invoice: CommercialInvoice): Buffer {
  const ops: string[] = [];
  const logo = loadCommercialPdfLogoImage();
  renderBrandHeader(ops, 'INVOICE', invoice.invoiceNumber, invoice.billingDate);

  ops.push(pdfText('BILL TO:', 40, 650, 8, 'F2'));
  ops.push(pdfText(fitText(invoice.customerName, 34), 40, 636, 9));
  ops.push(pdfText(fitText(invoice.contact, 34), 40, 622, 8));
  ops.push(pdfText(fitText(invoice.email, 34), 40, 608, 8));
  ops.push(pdfText('WORK ORDER:', 245, 650, 8, 'F2'));
  ops.push(pdfText(invoice.workOrderNumber, 245, 636, 9, 'F2'));
  ops.push(pdfText(fitText(invoice.jobName, 34), 245, 622, 8));
  ops.push(pdfText('NEXT INVOICE DATE:', 438, 650, 8, 'F2'));
  ops.push(pdfText(formatDate(invoice.nextInvoiceDate), 438, 636, 9));

  const columns = [
    { label: 'SKU', x: 42, w: 66 },
    { label: 'DESCRIPTION', x: 112, w: 170 },
    { label: 'ON RENT', x: 286, w: 52 },
    { label: 'DAYS', x: 342, w: 48 },
    { label: 'INV QTY', x: 394, w: 54 },
    { label: 'RATE', x: 452, w: 54 },
    { label: 'AMOUNT', x: 510, w: 62 },
  ];
  tableHeader(ops, 570, columns);
  let y = 548;
  const items = Array.isArray(invoice.items) ? (invoice.items as PdfItem[]) : [];
  items.slice(0, 14).forEach((item) => {
    ops.push(pdfRect(40, y - 9, 532, 20));
    ops.push(pdfText(fitText(item.sku, 12), 46, y - 2, 7));
    ops.push(pdfText(fitText(item.description, 30), 118, y - 2, 7));
    ops.push(pdfText(numberValue(item.onRentQty), 298, y - 2, 7));
    ops.push(pdfText(numberValue(item.rentalDurationDays), 354, y - 2, 7));
    ops.push(pdfText(numberValue(item.invoiceQty), 408, y - 2, 7));
    ops.push(pdfText(money(item.unitPrice), 458, y - 2, 7));
    ops.push(pdfText(money(item.amount), 516, y - 2, 7));
    y -= 20;
  });

  ops.push(pdfRect(392, 166, 180, 48));
  ops.push(pdfText('SUBTOTAL', 404, 196, 8, 'F2'));
  ops.push(pdfText(money(invoice.amount), 504, 196, 8, 'F2'));
  ops.push(pdfText('TAX (0%)', 404, 181, 8, 'F2'));
  ops.push(pdfText('$0.00', 504, 181, 8, 'F2'));
  ops.push(pdfFillRect(392, 146, 180, 20, [0.82, 0, 0]));
  ops.push(pdfText('TOTAL', 404, 153, 9, 'F2'));
  ops.push(pdfText(money(invoice.amount), 504, 153, 9, 'F2'));
  ops.push(pdfText('Thank you for your business!', 236, 58, 9));
  return buildPdf(ops.join('\n'), logo ? [logo] : []);
}
