import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { UserAccessContext } from '../../access/ports/access.port';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateFormTemplateDto } from '../dto/create-form-template.dto';
import { UpdateFormTemplateDto } from '../dto/update-form-template.dto';
import { FormContextResolutionService } from '../services/form-context-resolution.service';
import { FormTemplatesService } from '../services/form-templates.service';

type ReqWithOpsUser = Request & { user?: UserAccessContext };

@ApiTags('operations')
@Controller('form-templates')
@UseGuards(OperationsAuthGuard)
export class FormTemplatesController {
  constructor(
    private readonly service: FormTemplatesService,
    private readonly contextResolution: FormContextResolutionService,
  ) {}

  @Get()
  findAll(
    @Query('projectId') projectId?: string,
    @Query('role') role?: string,
    @Query('workOrderId') workOrderId?: string,
    @Req() req?: ReqWithOpsUser,
  ) {
    const filterForActor = (templates: Awaited<ReturnType<FormTemplatesService['findAll']>>) =>
      this.filterTemplatesForActor(templates, req?.user);
    if (projectId || role || workOrderId) {
      return this.service
        .findAssigned({ projectId, role, workOrderId })
        .then(filterForActor);
    }
    return this.service.findAll().then(filterForActor);
  }

  /**
   * Devuelve valores sugeridos por campo según dataBinding y la assignment (work order).
   * Query: workOrderId (obligatorio), shiftId (opcional, para rutas shift.*).
   */
  @Get(':id/context-preview')
  contextPreview(
    @Param('id') id: string,
    @Query('workOrderId') workOrderId?: string,
    @Query('shiftId') shiftId?: string,
    @Req() req?: ReqWithOpsUser,
  ) {
    const w = workOrderId?.trim();
    if (!w) {
      throw new BadRequestException('workOrderId query parameter is required');
    }
    return this.contextResolution.previewTemplateForWorkOrder(id, w, shiftId, req?.user);
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

  private filterTemplatesForActor(
    templates: Awaited<ReturnType<FormTemplatesService['findAll']>>,
    actor?: UserAccessContext,
  ) {
    if (!actor) return templates;
    if (actor.permissions.includes('form-submissions.write')) return templates;
    if (!actor.permissions.includes('mobile.timesheets.submit')) return templates;
    return templates.filter((template) =>
      (template.category || '').toLowerCase().includes('timesheet'),
    );
  }
}
