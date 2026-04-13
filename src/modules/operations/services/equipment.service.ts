import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Equipment } from '../../../entities/equipment.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateEquipmentDto } from '../dto/create-equipment.dto';
import { UpdateEquipmentDto } from '../dto/update-equipment.dto';

@Injectable()
export class EquipmentService {
  constructor(
    @InjectRepository(Equipment)
    private readonly equipmentRepo: Repository<Equipment>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.equipmentRepo.find({ order: { identifier: 'ASC' } });
  }

  async findOne(id: string) {
    const item = await this.equipmentRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Equipment ${id} not found`);
    return item;
  }

  create(dto: CreateEquipmentDto) {
    return this.equipmentRepo
      .save(this.equipmentRepo.create(dto))
      .then((saved) => {
        this.realtime.emitTableUpdated('equipment');
        return saved;
      });
  }

  async update(id: string, dto: UpdateEquipmentDto) {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    const saved = await this.equipmentRepo.save(item);
    this.realtime.emitTableUpdated('equipment');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.equipmentRepo.remove(item);
    this.realtime.emitTableUpdated('equipment');
    return { success: true };
  }
}
