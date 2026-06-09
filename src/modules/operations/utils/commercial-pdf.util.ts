import { CommercialInvoice } from '../../../entities/commercial-invoice.entity';
import { CommercialWorkOrder } from '../../../entities/commercial-work-order.entity';

type PdfItem = Record<string, unknown>;

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

function buildPdf(content: string): Buffer {
  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  objects.push(
    `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
  );

  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'utf8')];
  let length = parts[0].length;
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(length);
    const block = Buffer.from(`${index + 1} 0 obj\n${object}\nendobj\n`, 'utf8');
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
  ops.push(pdfFillRect(40, 708, 44, 44, [0.82, 0, 0]));
  ops.push(pdfFillRect(46, 716, 32, 8, [1, 1, 1]));
  ops.push(pdfFillRect(46, 732, 32, 8, [1, 1, 1]));
  ops.push(pdfText('DR', 96, 724, 34, 'F2'));
  ops.push(pdfText('TRAFFIC CONTROL', 98, 713, 8, 'F2'));
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
  return buildPdf(ops.join('\n'));
}

export function buildCommercialInvoicePdf(invoice: CommercialInvoice): Buffer {
  const ops: string[] = [];
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
  return buildPdf(ops.join('\n'));
}
