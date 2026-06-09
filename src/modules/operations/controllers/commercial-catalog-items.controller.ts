import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateCommercialCatalogItemDto } from '../dto/create-commercial-catalog-item.dto';
import { UpdateCommercialCatalogItemDto } from '../dto/update-commercial-catalog-item.dto';
import { CommercialCatalogItemsService } from '../services/commercial-catalog-items.service';

@ApiTags('operations')
@Controller('commercial-catalog-items')
@UseGuards(OperationsAuthGuard)
export class CommercialCatalogItemsController {
  constructor(private readonly service: CommercialCatalogItemsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiBody({ type: CreateCommercialCatalogItemDto })
  create(@Body() dto: CreateCommercialCatalogItemDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateCommercialCatalogItemDto })
  update(@Param('id') id: string, @Body() dto: UpdateCommercialCatalogItemDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
