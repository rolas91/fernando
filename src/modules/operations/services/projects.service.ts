import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../../../entities/project.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateProjectDto } from '../dto/create-project.dto';
import { UpdateProjectDto } from '../dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectsRepo: Repository<Project>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.projectsRepo.find({ order: { number: 'ASC' } });
  }

  async findOne(id: string) {
    const project = await this.projectsRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  create(dto: CreateProjectDto) {
    const entity = this.projectsRepo.create(dto);
    return this.projectsRepo.save(entity).then((saved) => {
      this.realtime.emitTableUpdated('projects');
      return saved;
    });
  }

  async update(id: string, dto: UpdateProjectDto) {
    const project = await this.findOne(id);
    Object.assign(project, dto);
    const saved = await this.projectsRepo.save(project);
    this.realtime.emitTableUpdated('projects');
    return saved;
  }

  async remove(id: string) {
    const project = await this.findOne(id);
    await this.projectsRepo.remove(project);
    this.realtime.emitTableUpdated('projects');
    return { success: true };
  }
}
