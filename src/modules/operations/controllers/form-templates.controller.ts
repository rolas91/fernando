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

function normalizedTemplateText(value: string | undefined) {
  return (value || '').trim().toLowerCase().replace(/[_\s-]+/g, ' ');
}

function templateCategoryKey(template: { category?: string; name?: string }) {
  const category = normalizedTemplateText(template.category);
  const name = normalizedTemplateText(template.name);
  if (category.includes('timesheet') || category.includes('time sheet') || name.includes('timesheet') || name.includes('time sheet')) {
    return 'timesheet';
  }
  if (category.includes('incident') || name.includes('incident')) return 'incident';
  if (
    category.includes('work order') ||
    category.includes('workorder') ||
    name.includes('work order') ||
    name.includes('workorder')
  ) {
    return 'workorder';
  }
  return 'other';
}

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
    return templates.filter((template) => {
      const category = templateCategoryKey(template);
      if (category === 'timesheet') return actor.permissions.includes('mobile.timesheets.submit');
      if (category === 'incident') return actor.permissions.includes('mobile.incidents.submit');
      if (category === 'workorder') return actor.permissions.includes('mobile.work-orders.submit');
      return true;
    });
  }
}
