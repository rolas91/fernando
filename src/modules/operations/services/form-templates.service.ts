import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormTemplate } from '../../../entities/form-template.entity';
import { CreateFormTemplateDto } from '../dto/create-form-template.dto';
import { UpdateFormTemplateDto } from '../dto/update-form-template.dto';
import { normalizeFormFields } from '../utils/form-contract.util';

@Injectable()
export class FormTemplatesService {
  constructor(
    @InjectRepository(FormTemplate)
    private readonly repo: Repository<FormTemplate>,
  ) {}

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findAssigned(filters: { projectId?: string; role?: string }) {
    const projectId = filters.projectId?.trim();
    const role = filters.role?.trim();
    const templates = await this.findAll();

    return templates.filter((template) => {
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
