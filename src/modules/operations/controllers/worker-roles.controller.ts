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
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateWorkerRoleDto } from '../dto/create-worker-role.dto';
import { UpdateWorkerRoleDto } from '../dto/update-worker-role.dto';
import { WorkerRolesService } from '../services/worker-roles.service';

@ApiTags('operations')
@Controller('worker-roles')
@UseGuards(OperationsAuthGuard)
export class WorkerRolesController {
  constructor(private readonly service: WorkerRolesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiBody({ type: CreateWorkerRoleDto })
  create(@Body() dto: CreateWorkerRoleDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateWorkerRoleDto })
  update(@Param('id') id: string, @Body() dto: UpdateWorkerRoleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
