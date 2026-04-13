import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from '../../../entities/incident.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateIncidentDto } from '../dto/create-incident.dto';
import { UpdateIncidentDto } from '../dto/update-incident.dto';

@Injectable()
export class IncidentsService {
  constructor(
    @InjectRepository(Incident)
    private readonly repo: Repository<Incident>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.repo.find({ order: { date: 'DESC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Incident ${id} not found`);
    return item;
  }

  create(dto: CreateIncidentDto) {
    return this.repo.save(this.repo.create(dto)).then((saved) => {
      this.realtime.emitTableUpdated('incidents');
      return saved;
    });
  }

  async update(id: string, dto: UpdateIncidentDto) {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('incidents');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('incidents');
    return { success: true };
  }
}
