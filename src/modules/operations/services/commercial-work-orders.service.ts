import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import {
  CommercialWorkOrder,
  CommercialWorkOrderStatus,
} from '../../../entities/commercial-work-order.entity';
import { CommercialInvoice } from '../../../entities/commercial-invoice.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateCommercialWorkOrderDto } from '../dto/create-commercial-work-order.dto';
import { GenerateCommercialInvoiceDto } from '../dto/generate-commercial-invoice.dto';
import { ProcessOffRentDto } from '../dto/process-off-rent.dto';
import { UpdateCommercialWorkOrderDto } from '../dto/update-commercial-work-order.dto';
import {
  buildCommercialInvoicePdf,
  buildCommercialWorkOrderPdf,
} from '../utils/commercial-pdf.util';

type CommercialItem = Record<string, unknown> & {
  id: string;
  sku: string;
  description: string;
  qty?: number;
  price?: number;
  amount?: number;
  dailyRate?: number;
  unit?: string;
  onRentQty?: number;
  onRentDate?: string;
  offRentQty?: number;
  remainingQty?: number;
  lossQty?: number;
  rentalDurationDays?: number;
};

@Injectable()
export class CommercialWorkOrdersService {
  constructor(
    @InjectRepository(CommercialWorkOrder)
    private readonly repo: Repository<CommercialWorkOrder>,
    @InjectRepository(CommercialInvoice)
    private readonly invoicesRepo: Repository<CommercialInvoice>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.repo.find({ order: { createdAt: 'DESC', workOrderNumber: 'DESC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Work order ${id} not found`);
    return item;
  }

  async findOpenRentals() {
    return this.repo.find({
      where: { type: 'on_rent', status: 'on_rent' },
      order: { onRentDate: 'DESC', workOrderNumber: 'DESC' },
    });
  }

  async create(dto: CreateCommercialWorkOrderDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('At least one material or equipment line is required.');
    }

    const workOrderNumber = dto.workOrderNumber?.trim() || (await this.nextWorkOrderNumber());
    const normalized = this.repo.create({
      id: `cwo_${randomUUID()}`,
      workOrderNumber,
      type: dto.type,
      status: this.resolveCreateStatus(dto.type, dto.status),
      jobNumber: dto.jobNumber?.trim() || '',
      jobName: dto.jobName.trim(),
      projectId: dto.projectId?.trim() || '',
      customerId: dto.customerId?.trim() || '',
      customerName: dto.customerName.trim(),
      contact: dto.contact?.trim() || '',
      phone: dto.phone?.trim() || '',
      email: dto.email?.trim() || '',
      customerOrderNumber: dto.customerOrderNumber?.trim() || '',
      descriptionOfWork: dto.descriptionOfWork?.trim() || '',
      workDate: dto.workDate || this.todayIso(),
      onRentDate: dto.type === 'on_rent' ? dto.onRentDate || dto.workDate || this.todayIso() : null,
      originalOnRentDate:
        dto.type === 'on_rent' ? dto.onRentDate || dto.workDate || this.todayIso() : null,
      previousBillingDate: dto.previousBillingDate || null,
      nextInvoiceDate:
        dto.type === 'on_rent'
          ? dto.nextInvoiceDate || this.addDays(dto.onRentDate || dto.workDate || this.todayIso(), 28)
          : null,
      items: this.normalizeItems(dto.type, dto.items, dto.onRentDate || dto.workDate || this.todayIso()),
      notes: dto.notes?.trim() || '',
      createdBy: dto.createdBy?.trim() || '',
    });
    normalized.pdfHtml = this.renderPdfHtml(normalized);
    normalized.pdfGeneratedAt = new Date();

    const saved = await this.repo.save(normalized);
    this.realtime.emitTableUpdated('commercial_work_orders');
    return saved;
  }

  async update(id: string, dto: UpdateCommercialWorkOrderDto) {
    const item = await this.findOne(id);
    if (item.status === 'closed') {
      throw new BadRequestException('Closed work orders cannot be edited.');
    }
    Object.assign(item, {
      ...dto,
      workOrderNumber: dto.workOrderNumber?.trim() || item.workOrderNumber,
      jobNumber: dto.jobNumber?.trim() ?? item.jobNumber,
      jobName: dto.jobName?.trim() ?? item.jobName,
      projectId: dto.projectId?.trim() ?? item.projectId,
      customerId: dto.customerId?.trim() ?? item.customerId,
      customerName: dto.customerName?.trim() ?? item.customerName,
      contact: dto.contact?.trim() ?? item.contact,
      phone: dto.phone?.trim() ?? item.phone,
      email: dto.email?.trim() ?? item.email,
      customerOrderNumber: dto.customerOrderNumber?.trim() ?? item.customerOrderNumber,
      descriptionOfWork: dto.descriptionOfWork?.trim() ?? item.descriptionOfWork,
      notes: dto.notes?.trim() ?? item.notes,
    });
    if (dto.items) {
      item.items = this.normalizeItems(item.type, dto.items, item.onRentDate || item.workDate || this.todayIso());
    }
    item.status = this.resolveCreateStatus(item.type, dto.status) as CommercialWorkOrderStatus;
    item.pdfHtml = this.renderPdfHtml(item);
    item.pdfGeneratedAt = new Date();
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('commercial_work_orders');
    return saved;
  }

  async regeneratePdf(id: string) {
    const item = await this.findOne(id);
    item.pdfHtml = this.renderPdfHtml(item);
    item.pdfGeneratedAt = new Date();
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('commercial_work_orders');
    return saved;
  }

  async processOffRent(id: string, dto: ProcessOffRentDto) {
    const original = await this.findOne(id);
    if (original.type !== 'on_rent' || original.status !== 'on_rent') {
      throw new BadRequestException('Only active On Rent work orders can be processed for off rent.');
    }

    const returnByItem = new Map(dto.items.map((item) => [item.itemId, item]));
    const originalItems = this.asItems(original.items);
    const returnedItems = originalItems.map((item) => {
      const row = returnByItem.get(item.id);
      const onRentQty = this.numberValue(item.onRentQty);
      const offRentQty = Math.min(Math.max(this.numberValue(row?.offRentQty), 0), onRentQty);
      const lossQty = Math.min(Math.max(this.numberValue(row?.lossQty), 0), Math.max(onRentQty - offRentQty, 0));
      const remainingQty = Math.max(onRentQty - offRentQty - lossQty, 0);
      return {
        ...item,
        offRentDate: dto.offRentDate,
        offRentQty,
        lossQty,
        remainingQty,
        rentalDurationDays: this.diffDays(item.onRentDate || original.onRentDate, dto.offRentDate),
      };
    });
    const totalRemaining = returnedItems.reduce((sum, item) => sum + this.numberValue(item.remainingQty), 0);
    original.status = 'closed';
    original.offRentDate = dto.offRentDate;
    original.notes = dto.notes?.trim() || original.notes;
    original.items = returnedItems;
    original.pdfHtml = this.renderPdfHtml(original);
    original.pdfGeneratedAt = new Date();
    const savedOriginal = await this.repo.save(original);

    let rollover: CommercialWorkOrder | null = null;
    if (totalRemaining > 0) {
      const rolloverNumber = await this.nextRolloverNumber(original);
      rollover = this.repo.create({
        ...original,
        id: `cwo_${randomUUID()}`,
        workOrderNumber: rolloverNumber,
        status: 'on_rent',
        parentWorkOrderId: original.id,
        rolloverIndex: (original.rolloverIndex || 0) + 1,
        offRentDate: null,
        createdAt: undefined as unknown as Date,
        updatedAt: undefined as unknown as Date,
        items: returnedItems
          .filter((item) => this.numberValue(item.remainingQty) > 0)
          .map((item) => ({
            ...item,
            id: `line_${randomUUID()}`,
            onRentQty: this.numberValue(item.remainingQty),
            offRentDate: null,
            offRentQty: 0,
            remainingQty: undefined,
            lossQty: 0,
            rentalDurationDays: undefined,
          })),
      });
      rollover.pdfHtml = this.renderPdfHtml(rollover);
      rollover.pdfGeneratedAt = new Date();
      rollover = await this.repo.save(rollover);
    }

    this.realtime.emitTableUpdated('commercial_work_orders');
    return {
      original: savedOriginal,
      rollover,
      summary: {
        totalOriginal: originalItems.reduce((sum, item) => sum + this.numberValue(item.onRentQty), 0),
        totalReturned: returnedItems.reduce((sum, item) => sum + this.numberValue(item.offRentQty), 0),
        totalRemaining,
        totalLoss: returnedItems.reduce((sum, item) => sum + this.numberValue(item.lossQty), 0),
      },
    };
  }

  findInvoices() {
    return this.invoicesRepo.find({ order: { createdAt: 'DESC', invoiceNumber: 'DESC' } });
  }

  async findInvoice(id: string) {
    const invoice = await this.invoicesRepo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    return invoice;
  }

  async generateInvoice(workOrderId: string, dto: GenerateCommercialInvoiceDto) {
    const workOrder = await this.findOne(workOrderId);
    if (workOrder.type !== 'on_rent' || workOrder.status !== 'on_rent') {
      throw new BadRequestException('Only active On Rent work orders can generate rental invoices.');
    }
    const billingDate = dto.billingDate || this.todayIso();
    const itemIdSet = new Set((dto.itemIds || []).filter(Boolean));
    const allItems = this.asItems(workOrder.items);
    const sourceItems = itemIdSet.size > 0
      ? allItems.filter((item) => itemIdSet.has(item.id))
      : allItems;
    if (sourceItems.length === 0) {
      throw new BadRequestException('At least one item must be selected for the invoice.');
    }
    const invoiceItems = sourceItems.map((item) => {
      const duration = this.diffDays(item.onRentDate || workOrder.onRentDate, billingDate) || 28;
      const qty = this.numberValue(item.onRentQty);
      const dailyRate = this.numberValue(item.dailyRate);
      const amount = qty * dailyRate * duration;
      return {
        itemId: item.id,
        sku: item.sku,
        description: item.description,
        onRentQty: qty,
        rentalDurationDays: duration,
        invoiceQty: qty,
        unit: item.unit || 'Each',
        unitPrice: dailyRate,
        amount,
      };
    });
    const amount = invoiceItems.reduce((sum, item) => sum + this.numberValue(item.amount), 0);
    const invoice = this.invoicesRepo.create({
      id: `cinv_${randomUUID()}`,
      invoiceNumber: await this.nextInvoiceNumber(),
      commercialWorkOrderId: workOrder.id,
      workOrderNumber: workOrder.workOrderNumber,
      customerName: workOrder.customerName,
      jobName: workOrder.jobName,
      contact: workOrder.contact,
      email: workOrder.email,
      billingDate,
      nextInvoiceDate: this.addDays(billingDate, 28),
      amount,
      status: 'generated',
      items: invoiceItems,
      createdBy: dto.createdBy?.trim() || '',
    });
    invoice.pdfHtml = this.renderInvoiceHtml(invoice);
    const saved = await this.invoicesRepo.save(invoice);

    workOrder.previousBillingDate = billingDate;
    workOrder.nextInvoiceDate = saved.nextInvoiceDate;
    await this.repo.save(workOrder);

    this.realtime.emitTableUpdated('commercial_invoices');
    this.realtime.emitTableUpdated('commercial_work_orders');
    return saved;
  }

  buildWorkOrderPdf(workOrder: CommercialWorkOrder) {
    return buildCommercialWorkOrderPdf(workOrder);
  }

  buildInvoicePdf(invoice: CommercialInvoice) {
    return buildCommercialInvoicePdf(invoice);
  }

  private resolveCreateStatus(type: 'sale' | 'on_rent', status?: string) {
    if (status === 'draft') return 'draft';
    return type === 'sale' ? 'sale_completed' : 'on_rent';
  }

  private normalizeItems(type: 'sale' | 'on_rent', items: Array<Record<string, unknown> | object>, defaultOnRentDate: string) {
    return items.map((rawItem) => {
      const item = rawItem as Record<string, unknown>;
      const qty = this.numberValue(item.qty);
      const price = this.numberValue(item.price);
      const onRentQty = this.numberValue(item.onRentQty || item.qty);
      const dailyRate = this.numberValue(item.dailyRate ?? item.price);
      return {
        id: typeof item.id === 'string' && item.id.trim() ? item.id : `line_${randomUUID()}`,
        catalogItemId: typeof item.catalogItemId === 'string' ? item.catalogItemId : '',
        catalogSource: typeof item.catalogSource === 'string' ? item.catalogSource : '',
        sku: String(item.sku || '').trim(),
        description: String(item.description || '').trim(),
        qty: type === 'sale' ? qty : undefined,
        price: type === 'sale' ? price : undefined,
        amount: type === 'sale' ? qty * price : undefined,
        dailyRate,
        unit: String(item.unit || 'Each').trim() || 'Each',
        onRentQty: type === 'on_rent' ? onRentQty : undefined,
        onRentDate: type === 'on_rent' ? String(item.onRentDate || defaultOnRentDate) : undefined,
        notes: String(item.notes || '').trim(),
        lossQty: 0,
      };
    });
  }

  private asItems(items: Record<string, unknown>[]) {
    return (Array.isArray(items) ? items : []) as CommercialItem[];
  }

  private async nextWorkOrderNumber() {
    const latest = await this.repo
      .createQueryBuilder('wo')
      .where("wo.work_order_number ~ '^WO-[0-9]+$'")
      .orderBy('wo.workOrderNumber', 'DESC')
      .getOne();
    const current = Number((latest?.workOrderNumber || 'WO-00000').replace(/\D/g, ''));
    return `WO-${String(current + 1).padStart(5, '0')}`;
  }

  private async nextInvoiceNumber() {
    const latest = await this.invoicesRepo
      .createQueryBuilder('invoice')
      .where("invoice.invoice_number ~ '^INV-[0-9]+$'")
      .orderBy('invoice.invoiceNumber', 'DESC')
      .getOne();
    const current = Number((latest?.invoiceNumber || 'INV-000000').replace(/\D/g, ''));
    return `INV-${String(current + 1).padStart(6, '0')}`;
  }

  private async nextRolloverNumber(original: CommercialWorkOrder) {
    const base = original.workOrderNumber.replace(/-\d+$/, '');
    const rows = await this.repo
      .createQueryBuilder('wo')
      .where('wo.work_order_number = :base OR wo.work_order_number LIKE :prefix', {
        base,
        prefix: `${base}-%`,
      })
      .getMany();
    const maxSuffix = rows.reduce((max, row) => {
      const match = row.workOrderNumber.match(/-(\d+)$/);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 0);
    return `${base}-${maxSuffix + 1}`;
  }

  private renderPdfHtml(workOrder: CommercialWorkOrder) {
    const isSale = workOrder.type === 'sale';
    const title = isSale ? 'SALE WORK ORDER' : 'WORK ORDER';
    const rows = this.asItems(workOrder.items)
      .map((item) => {
        const qty = isSale ? this.numberValue(item.qty) : this.numberValue(item.onRentQty);
        const amount = isSale ? this.money(this.numberValue(item.amount)) : '';
        return `<tr><td>${this.escape(item.sku)}</td><td>${this.escape(item.description)}</td><td>${qty}</td><td>Each</td><td>${isSale ? this.money(this.numberValue(item.price)) : '-'}</td><td>${amount}</td></tr>`;
      })
      .join('');
    const total = this.asItems(workOrder.items).reduce((sum, item) => sum + this.numberValue(item.amount), 0);
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;color:#111827;margin:32px} .top{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #94a3b8;padding-bottom:22px}
      .logo{font-size:54px;font-weight:900;letter-spacing:-5px}.red{color:#d40000}.meta{text-align:right}.meta h1{margin:0;font-size:30px}.meta h2{margin:6px 0;color:#b91c1c}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin:28px 0}.label{color:#b91c1c;font-weight:700;font-size:12px;text-transform:uppercase}.value{margin-top:8px;line-height:1.45}
      table{width:100%;border-collapse:collapse;margin-top:22px}th{background:#111827;color:white;font-size:12px;text-transform:uppercase}td,th{border:1px solid #cbd5e1;padding:10px;text-align:left}td:nth-child(3),td:nth-child(5),td:nth-child(6){text-align:center}
      .notes{margin-top:24px;border:1px solid #cbd5e1;padding:14px;min-height:54px}.total{margin-left:auto;margin-top:18px;width:320px}.total div{display:flex;justify-content:space-between;border:1px solid #cbd5e1;padding:10px}.total .grand{background:#d40000;color:white;font-weight:800}.footer{text-align:center;color:#64748b;margin-top:42px}
    </style></head><body>
      <div class="top"><div><div class="logo"><span class="red">DR</span></div><div class="label">Traffic Control</div><div class="value">456 Traffic Way<br/>San Jose, CA 95131<br/>Phone: (408) 555-1234</div></div><div class="meta"><h1>${title}</h1><h2>${this.escape(workOrder.workOrderNumber)}</h2><div>Date: ${this.escape(workOrder.workDate || workOrder.onRentDate || '')}</div><div>Page: 1 of 1</div></div></div>
      <div class="grid"><div><div class="label">Bill To</div><div class="value">${this.escape(workOrder.customerName)}<br/>${this.escape(workOrder.contact)}<br/>${this.escape(workOrder.phone)}<br/>${this.escape(workOrder.email)}</div></div><div><div class="label">Job Name / Location</div><div class="value">${this.escape(workOrder.jobName)}<br/>${this.escape(workOrder.jobNumber)}</div></div><div><div class="label">${isSale ? 'Customer Order #' : 'On Rent Date'}</div><div class="value">${this.escape(isSale ? workOrder.customerOrderNumber : workOrder.onRentDate || '')}</div></div></div>
      <table><thead><tr><th>Item</th><th>Description</th><th>Qty</th><th>Unit</th><th>${isSale ? 'Price' : 'Daily Rate'}</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="notes"><strong>Notes:</strong><br/>${this.escape(workOrder.notes || workOrder.descriptionOfWork)}</div>
      ${isSale ? `<div class="total"><div><span>Subtotal</span><strong>${this.money(total)}</strong></div><div><span>Tax (0%)</span><strong>$0.00</strong></div><div class="grand"><span>Total</span><span>${this.money(total)}</span></div></div>` : ''}
      <div class="footer">Thank you for your business!</div>
    </body></html>`;
  }

  private renderInvoiceHtml(invoice: CommercialInvoice) {
    const rows = (Array.isArray(invoice.items) ? invoice.items : [])
      .map((raw) => {
        const item = raw as Record<string, unknown>;
        return `<tr><td>${this.escape(item.sku)}</td><td>${this.escape(item.description)}</td><td>${this.numberValue(item.onRentQty)}</td><td>${this.numberValue(item.rentalDurationDays)}</td><td>${this.numberValue(item.invoiceQty)}</td><td>${this.money(this.numberValue(item.unitPrice))}</td><td>${this.money(this.numberValue(item.amount))}</td></tr>`;
      })
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;color:#111827;margin:32px}.top{display:flex;justify-content:space-between;border-bottom:2px solid #94a3b8;padding-bottom:20px}
      .logo{font-size:48px;font-weight:900;letter-spacing:-4px}.red{color:#d40000}.meta{text-align:right}.meta h1{margin:0;font-size:30px}.meta h2{margin:6px 0;color:#b91c1c}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin:28px 0}.label{color:#b91c1c;font-size:12px;font-weight:700;text-transform:uppercase}.value{margin-top:8px;line-height:1.45}
      table{width:100%;border-collapse:collapse;margin-top:22px}th{background:#111827;color:#fff;font-size:12px;text-transform:uppercase}td,th{border:1px solid #cbd5e1;padding:10px}td:not(:nth-child(2)){text-align:center}.total{margin-left:auto;margin-top:18px;width:320px}.total div{display:flex;justify-content:space-between;border:1px solid #cbd5e1;padding:10px}.grand{background:#d40000;color:white;font-weight:800}.footer{text-align:center;color:#64748b;margin-top:42px}
    </style></head><body>
      <div class="top"><div><div class="logo"><span class="red">DR</span></div><div class="label">Traffic Control</div><div class="value">456 Traffic Way<br/>San Jose, CA 95131</div></div><div class="meta"><h1>INVOICE</h1><h2>${this.escape(invoice.invoiceNumber)}</h2><div>Billing Date: ${this.escape(invoice.billingDate)}</div><div>Work Order: ${this.escape(invoice.workOrderNumber)}</div></div></div>
      <div class="grid"><div><div class="label">Bill To</div><div class="value">${this.escape(invoice.customerName)}<br/>${this.escape(invoice.contact)}<br/>${this.escape(invoice.email)}</div></div><div><div class="label">Job Name</div><div class="value">${this.escape(invoice.jobName)}</div></div><div><div class="label">Next Invoice Date</div><div class="value">${this.escape(invoice.nextInvoiceDate)}</div></div></div>
      <table><thead><tr><th>SKU</th><th>Description</th><th>On Rent Qty</th><th>Rental Duration</th><th>This Invoice Qty</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="total"><div><span>Subtotal</span><strong>${this.money(Number(invoice.amount))}</strong></div><div><span>Tax (0%)</span><strong>$0.00</strong></div><div class="grand"><span>Total</span><span>${this.money(Number(invoice.amount))}</span></div></div>
      <div class="footer">Thank you for your business!</div>
    </body></html>`;
  }

  private numberValue(value: unknown) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private addDays(date: string, days: number) {
    const parsed = new Date(`${date}T00:00:00`);
    parsed.setDate(parsed.getDate() + days);
    return parsed.toISOString().slice(0, 10);
  }

  private diffDays(start: unknown, end: string) {
    if (typeof start !== 'string' || !start) return 0;
    const a = new Date(`${start}T00:00:00`).getTime();
    const b = new Date(`${end}T00:00:00`).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.max(Math.ceil((b - a) / 86400000), 0);
  }

  private todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  private money(value: number) {
    return `$${value.toFixed(2)}`;
  }

  private escape(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
