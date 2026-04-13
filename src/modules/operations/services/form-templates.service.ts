import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormTemplate } from '../../../entities/form-template.entity';
import { CreateFormTemplateDto } from '../dto/create-form-template.dto';
import { UpdateFormTemplateDto } from '../dto/update-form-template.dto';

@Injectable()
export class FormTemplatesService {
  constructor(
    @InjectRepository(FormTemplate)
    private readonly repo: Repository<FormTemplate>,
  ) {}

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Form template ${id} not found`);
    return item;
  }

  create(dto: CreateFormTemplateDto) {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdateFormTemplateDto) {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    return this.repo.save(item);
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    return { success: true };
  }
}
