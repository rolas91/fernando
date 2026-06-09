import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateCommercialWorkOrderDto } from '../dto/create-commercial-work-order.dto';
import { GenerateCommercialInvoiceDto } from '../dto/generate-commercial-invoice.dto';
import { ProcessOffRentDto } from '../dto/process-off-rent.dto';
import { UpdateCommercialWorkOrderDto } from '../dto/update-commercial-work-order.dto';
import { CommercialWorkOrdersService } from '../services/commercial-work-orders.service';

@ApiTags('operations')
@Controller('commercial-work-orders')
@UseGuards(OperationsAuthGuard)
export class CommercialWorkOrdersController {
  constructor(private readonly service: CommercialWorkOrdersService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('open-rentals')
  findOpenRentals() {
    return this.service.findOpenRentals();
  }

  @Get('invoices')
  findInvoices() {
    return this.service.findInvoices();
  }

  @Get('invoices/:invoiceId')
  findInvoice(@Param('invoiceId') invoiceId: string) {
    return this.service.findInvoice(invoiceId);
  }

  @Get('invoices/:invoiceId/pdf')
  async invoicePdf(@Param('invoiceId') invoiceId: string, @Res() res: Response) {
    const invoice = await this.service.findInvoice(invoiceId);
    const pdf = this.service.buildInvoicePdf(invoice);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${invoice.invoiceNumber}.pdf"`,
    );
    return res.send(pdf);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const workOrder = await this.service.findOne(id);
    const pdf = this.service.buildWorkOrderPdf(workOrder);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${workOrder.workOrderNumber}.pdf"`,
    );
    return res.send(pdf);
  }

  @Post()
  @ApiBody({ type: CreateCommercialWorkOrderDto })
  create(@Body() dto: CreateCommercialWorkOrderDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateCommercialWorkOrderDto })
  update(@Param('id') id: string, @Body() dto: UpdateCommercialWorkOrderDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/regenerate-pdf')
  regeneratePdf(@Param('id') id: string) {
    return this.service.regeneratePdf(id);
  }

  @Post(':id/off-rent')
  @ApiBody({ type: ProcessOffRentDto })
  processOffRent(@Param('id') id: string, @Body() dto: ProcessOffRentDto) {
    return this.service.processOffRent(id, dto);
  }

  @Post(':id/invoices')
  @ApiBody({ type: GenerateCommercialInvoiceDto })
  generateInvoice(
    @Param('id') id: string,
    @Body() dto: GenerateCommercialInvoiceDto,
  ) {
    return this.service.generateInvoice(id, dto);
  }
}
