import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectType } from '../../../entities/project-type.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateProjectTypeDto } from '../dto/create-project-type.dto';
import { UpdateProjectTypeDto } from '../dto/update-project-type.dto';

@Injectable()
export class ProjectTypesService {
  constructor(
    @InjectRepository(ProjectType)
    private readonly repo: Repository<ProjectType>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Project type ${id} not found`);
    return item;
  }

  create(dto: CreateProjectTypeDto) {
    return this.repo.save(this.repo.create(dto)).then((saved) => {
      this.realtime.emitTableUpdated('project_types');
      return saved;
    });
  }

  async update(id: string, dto: UpdateProjectTypeDto) {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('project_types');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('project_types');
    return { success: true };
  }
}
