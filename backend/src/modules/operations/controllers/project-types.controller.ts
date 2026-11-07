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
import { CreateProjectTypeDto } from '../dto/create-project-type.dto';
import { UpdateProjectTypeDto } from '../dto/update-project-type.dto';
import { ProjectTypesService } from '../services/project-types.service';

@ApiTags('operations')
@Controller('project-types')
@UseGuards(OperationsAuthGuard)
export class ProjectTypesController {
  constructor(private readonly service: ProjectTypesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiBody({ type: CreateProjectTypeDto })
  create(@Body() dto: CreateProjectTypeDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateProjectTypeDto })
  update(@Param('id') id: string, @Body() dto: UpdateProjectTypeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
