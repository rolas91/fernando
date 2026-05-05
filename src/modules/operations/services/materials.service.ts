import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Material } from '../../../entities/material.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateMaterialDto } from '../dto/create-material.dto';
import { UpdateMaterialDto } from '../dto/update-material.dto';

@Injectable()
export class MaterialsService {
  constructor(
    @InjectRepository(Material)
    private readonly materialsRepo: Repository<Material>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.materialsRepo.find({ order: { identifier: 'ASC' } });
  }

  async findOne(id: string) {
    const item = await this.materialsRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Material ${id} not found`);
    return item;
  }

  create(dto: CreateMaterialDto) {
    return this.materialsRepo.save(this.materialsRepo.create(dto)).then((saved) => {
      this.realtime.emitTableUpdated('materials');
      return saved;
    });
  }

  async update(id: string, dto: UpdateMaterialDto) {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    const saved = await this.materialsRepo.save(item);
    this.realtime.emitTableUpdated('materials');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.materialsRepo.remove(item);
    this.realtime.emitTableUpdated('materials');
    return { success: true };
  }
}
