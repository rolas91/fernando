import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormTemplate } from '../../../entities/form-template.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { CreateFormTemplateDto } from '../dto/create-form-template.dto';
import { UpdateFormTemplateDto } from '../dto/update-form-template.dto';
import { normalizeFormFields } from '../utils/form-contract.util';

@Injectable()
export class FormTemplatesService {
  constructor(
    @InjectRepository(FormTemplate)
    private readonly repo: Repository<FormTemplate>,
    @InjectRepository(WorkOrder)
    private readonly workOrdersRepo: Repository<WorkOrder>,
  ) {}

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findAssigned(filters: {
    projectId?: string;
    role?: string;
    workOrderId?: string;
  }) {
    const projectId = filters.projectId?.trim();
    const role = filters.role?.trim();
    const workOrderId = filters.workOrderId?.trim();
    const templates = await this.findAll();

    let pickupIds: Set<string> | null = null;
    if (workOrderId) {
      const wo = await this.workOrdersRepo.findOne({ where: { id: workOrderId } });
      const ids = wo?.formTemplateIds?.filter((x) => x.trim().length > 0) ?? [];
      if (ids.length > 0) pickupIds = new Set(ids);
    }

    return templates.filter((template) => {
      if (pickupIds && !pickupIds.has(template.id)) return false;

      const projectMatches =
        !projectId ||
        !template.assignedProjects ||
        template.assignedProjects.length === 0 ||
        template.assignedProjects.includes(projectId);
      const roleMatches =
        !role ||
        !template.assignedRoles ||
        template.assignedRoles.length === 0 ||
        template.assignedRoles.includes(role);
      return projectMatches && roleMatches;
    });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Form template ${id} not found`);
    return item;
  }

  create(dto: CreateFormTemplateDto) {
    const payload = {
      ...dto,
      isRequired: dto.isRequired ?? true,
      fields: normalizeFormFields(dto.fields),
    };
    return this.repo.save(this.repo.create(payload));
  }

  async update(id: string, dto: UpdateFormTemplateDto) {
    const item = await this.findOne(id);
    Object.assign(item, {
      ...dto,
      fields:
        dto.fields !== undefined ? normalizeFormFields(dto.fields) : item.fields,
    });
    return this.repo.save(item);
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    return { success: true };
  }
}
