import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateFormTemplateDto } from '../dto/create-form-template.dto';
import { UpdateFormTemplateDto } from '../dto/update-form-template.dto';
import { FormTemplatesService } from '../services/form-templates.service';

@ApiTags('operations')
@Controller('form-templates')
@UseGuards(OperationsAuthGuard)
export class FormTemplatesController {
  constructor(private readonly service: FormTemplatesService) {}

  @Get()
  findAll(
    @Query('projectId') projectId?: string,
    @Query('role') role?: string,
  ) {
    if (projectId || role) {
      return this.service.findAssigned({ projectId, role });
    }
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiBody({ type: CreateFormTemplateDto })
  create(@Body() dto: CreateFormTemplateDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateFormTemplateDto })
  update(@Param('id') id: string, @Body() dto: UpdateFormTemplateDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
