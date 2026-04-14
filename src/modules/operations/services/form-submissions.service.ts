import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateFormSubmissionDto } from '../dto/create-form-submission.dto';
import { UpdateFormSubmissionDto } from '../dto/update-form-submission.dto';
import {
  normalizeFormFields,
  normalizeSubmissionData,
  validateSubmissionAgainstFields,
} from '../utils/form-contract.util';

@Injectable()
export class FormSubmissionsService {
  constructor(
    @InjectRepository(FormSubmission)
    private readonly repo: Repository<FormSubmission>,
    @InjectRepository(FormTemplate)
    private readonly templatesRepo: Repository<FormTemplate>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.repo.find({ order: { submittedAt: 'DESC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Form submission ${id} not found`);
    return item;
  }

  async create(dto: CreateFormSubmissionDto) {
    const template = dto.templateId
      ? await this.templatesRepo.findOne({ where: { id: dto.templateId } })
      : null;

    if (template) {
      validateSubmissionAgainstFields(
        normalizeFormFields(template.fields),
        dto.data,
      );
    }

    const saved = await this.repo.save(
      this.repo.create({
        ...dto,
        data: normalizeSubmissionData(dto.data),
        submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : undefined,
      }),
    );
    this.realtime.emitTableUpdated('form_submissions');
    return saved;
  }

  async update(id: string, dto: UpdateFormSubmissionDto) {
    const item = await this.findOne(id);
    const templateId = dto.templateId || item.templateId;
    const template = templateId
      ? await this.templatesRepo.findOne({ where: { id: templateId } })
      : null;

    if (template) {
      validateSubmissionAgainstFields(
        normalizeFormFields(template.fields),
        (dto.data as Record<string, unknown> | undefined) || item.data,
      );
    }

    Object.assign(item, {
      ...dto,
      data:
        dto.data !== undefined
          ? normalizeSubmissionData(dto.data as Record<string, unknown>)
          : item.data,
      submittedAt:
        dto.submittedAt !== undefined ? new Date(dto.submittedAt) : undefined,
    });
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('form_submissions');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('form_submissions');
    return { success: true };
  }
}
