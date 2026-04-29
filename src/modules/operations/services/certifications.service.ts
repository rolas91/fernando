import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Certification } from '../../../entities/certification.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateCertificationDto } from '../dto/create-certification.dto';
import { UpdateCertificationDto } from '../dto/update-certification.dto';
import { SpacesStorageService } from './spaces-storage.service';

@Injectable()
export class CertificationsService {
  constructor(
    @InjectRepository(Certification)
    private readonly repo: Repository<Certification>,
    private readonly realtime: RealtimeGateway,
    private readonly spacesStorage: SpacesStorageService,
  ) {}

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Certification ${id} not found`);
    return item;
  }

  create(dto: CreateCertificationDto) {
    return this.repo.save(this.repo.create(dto)).then((saved) => {
      this.realtime.emitTableUpdated('certifications');
      this.realtime.emitTableUpdated('workers');
      return saved;
    });
  }

  async update(id: string, dto: UpdateCertificationDto) {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('certifications');
    this.realtime.emitTableUpdated('workers');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    if (item.documentUrl) {
      await this.spacesStorage.deleteManyPublicFiles([item.documentUrl]);
    }
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('certifications');
    this.realtime.emitTableUpdated('workers');
    return { success: true };
  }
}
