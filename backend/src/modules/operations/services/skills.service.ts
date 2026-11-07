import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Skill } from '../../../entities/skill.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateSkillDto } from '../dto/create-skill.dto';
import { UpdateSkillDto } from '../dto/update-skill.dto';

@Injectable()
export class SkillsService {
  constructor(
    @InjectRepository(Skill)
    private readonly repo: Repository<Skill>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Skill ${id} not found`);
    return item;
  }

  create(dto: CreateSkillDto) {
    return this.repo.save(this.repo.create(dto)).then((saved) => {
      this.realtime.emitTableUpdated('skills');
      this.realtime.emitTableUpdated('workers');
      return saved;
    });
  }

  async update(id: string, dto: UpdateSkillDto) {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('skills');
    this.realtime.emitTableUpdated('workers');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('skills');
    this.realtime.emitTableUpdated('workers');
    return { success: true };
  }
}
