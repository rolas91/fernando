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
import { CreateWorkOrderTypeDto } from '../dto/create-work-order-type.dto';
import { UpdateWorkOrderTypeDto } from '../dto/update-work-order-type.dto';
import { WorkOrderTypesService } from '../services/work-order-types.service';

@ApiTags('operations')
@Controller('work-order-types')
@UseGuards(OperationsAuthGuard)
export class WorkOrderTypesController {
  constructor(private readonly service: WorkOrderTypesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateWorkOrderTypeDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkOrderTypeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
