import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanySettings } from '../../../entities/company-settings.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateCompanySettingsDto } from '../dto/create-company-settings.dto';
import { UpdateCompanySettingsDto } from '../dto/update-company-settings.dto';

@Injectable()
export class CompanySettingsService {
  constructor(
    @InjectRepository(CompanySettings)
    private readonly repo: Repository<CompanySettings>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Company settings ${id} not found`);
    return item;
  }

  create(dto: CreateCompanySettingsDto) {
    return this.repo.save(this.repo.create(dto)).then((saved) => {
      this.realtime.emitTableUpdated('company_settings');
      return saved;
    });
  }

  async update(id: string, dto: UpdateCompanySettingsDto) {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('company_settings');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('company_settings');
    return { success: true };
  }
}
