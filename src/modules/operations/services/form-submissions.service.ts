import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormSubmission } from '../../../entities/form-submission.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateFormSubmissionDto } from '../dto/create-form-submission.dto';
import { UpdateFormSubmissionDto } from '../dto/update-form-submission.dto';

@Injectable()
export class FormSubmissionsService {
  constructor(
    @InjectRepository(FormSubmission)
    private readonly repo: Repository<FormSubmission>,
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

  create(dto: CreateFormSubmissionDto) {
    return this.repo
      .save(
        this.repo.create({
          ...dto,
          submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : undefined,
        }),
      )
      .then((saved) => {
        this.realtime.emitTableUpdated('form_submissions');
        return saved;
      });
  }

  async update(id: string, dto: UpdateFormSubmissionDto) {
    const item = await this.findOne(id);
    Object.assign(item, {
      ...dto,
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
