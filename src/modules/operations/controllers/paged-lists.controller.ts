import { Controller, Get, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { Worker } from '../../../entities/worker.entity';
import { Project } from '../../../entities/project.entity';
import { Client } from '../../../entities/client.entity';
import { Equipment } from '../../../entities/equipment.entity';
import { Material } from '../../../entities/material.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { Timesheet } from '../../../entities/timesheet.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { Incident } from '../../../entities/incident.entity';

const resources: Record<string, EntityTarget<ObjectLiteral>> = {
  workers: Worker, projects: Project, clients: Client, equipment: Equipment,
  materials: Material, 'work-orders': WorkOrder, timesheets: Timesheet,
  'form-templates': FormTemplate, 'form-submissions': FormSubmission, incidents: Incident,
};

@Controller('paged')
@UseGuards(OperationsAuthGuard)
export class PagedListsController {
  constructor(private readonly dataSource: DataSource) {}

  @Get(':resource')
  async list(@Param('resource') resource: string, @Query('page') pageValue?: string, @Query('limit') limitValue?: string) {
    const entity = resources[resource];
    if (!entity) throw new BadRequestException(`Unsupported paged resource: ${resource}`);
    const page = Math.max(1, Number(pageValue) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitValue) || 10));
    const repository = this.dataSource.getRepository(entity);
    const [data, total] = await repository.findAndCount({ skip: (page - 1) * limit, take: limit });
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}
