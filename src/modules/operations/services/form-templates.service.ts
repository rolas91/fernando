import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormTemplate } from '../../../entities/form-template.entity';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';
import { CreateFormTemplateDto } from '../dto/create-form-template.dto';
import { UpdateFormTemplateDto } from '../dto/update-form-template.dto';
import { normalizeFormFields } from '../utils/form-contract.util';

@Injectable()
export class FormTemplatesService {
  constructor(
    @InjectRepository(FormTemplate)
    private readonly repo: Repository<FormTemplate>,
    @InjectRepository(WorkOrderShift)
    private readonly shiftsRepo: Repository<WorkOrderShift>,
  ) {}

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findAssigned(filters: {
    projectId?: string;
    role?: string;
    workOrderId?: string;
    shiftId?: string;
  }) {
    const projectId = filters.projectId?.trim();
    const role = filters.role?.trim();
    const workOrderId = filters.workOrderId?.trim();
    const shiftId = filters.shiftId?.trim();
    const templates = await this.findAll();

    let pickupIds: Set<string> | null = null;
    if (shiftId) {
      const shift = await this.shiftsRepo.findOne({
        where: workOrderId ? { id: shiftId, workOrderId } : { id: shiftId },
        select: { id: true, formTemplateIds: true },
      });
      pickupIds = new Set(
        shift?.formTemplateIds?.map((id) => id.trim()).filter(Boolean) ?? [],
      );
    } else if (workOrderId) {
      // Forms now belong to a concrete shift. A work order by itself has no form allowlist.
      pickupIds = new Set();
    }

    return templates.filter((template) => {
      if (pickupIds !== null && !pickupIds.has(template.id)) return false;

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
