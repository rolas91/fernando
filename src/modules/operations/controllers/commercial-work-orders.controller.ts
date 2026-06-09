import { Body, Controller, Get, Header, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateCommercialWorkOrderDto } from '../dto/create-commercial-work-order.dto';
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/pdf')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async pdf(@Param('id') id: string) {
    const workOrder = await this.service.findOne(id);
    return workOrder.pdfHtml || (await this.service.regeneratePdf(id)).pdfHtml;
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
}
