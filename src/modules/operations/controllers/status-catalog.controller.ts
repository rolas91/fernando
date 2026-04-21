import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateStatusCatalogDto } from '../dto/create-status-catalog.dto';
import { UpdateStatusCatalogDto } from '../dto/update-status-catalog.dto';
import { StatusCatalogService } from '../services/status-catalog.service';

@ApiTags('operations')
@Controller('status-catalog')
@UseGuards(OperationsAuthGuard)
export class StatusCatalogController {
  constructor(private readonly service: StatusCatalogService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateStatusCatalogDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStatusCatalogDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
