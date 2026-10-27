import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
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

  async findOne(id: string, includeArchived = false) {
    const item = await this.materialsRepo.findOne({
      where: { id },
      ...(includeArchived ? { withDeleted: true } : {}),
    });
    if (!item) throw new NotFoundException(`Material ${id} not found`);
    return item;
  }

  async create(dto: CreateMaterialDto) {
    if (
      await this.materialsRepo.findOne({
        where: { id: dto.id },
        withDeleted: true,
      })
    ) {
      throw new ConflictException('This material ID already exists.');
    }
    return this.materialsRepo
      .save(this.materialsRepo.create({ ...dto, sku: dto.sku?.trim() || '' }))
      .then((saved) => {
        this.realtime.emitTableUpdated('materials');
        return saved;
      });
  }

  async update(id: string, dto: UpdateMaterialDto) {
    if (dto.id !== undefined && dto.id !== id) {
      throw new BadRequestException(
        'The internal material ID cannot be changed.',
      );
    }
    const item = await this.findOne(id);
    Object.assign(item, dto);
    if (dto.sku !== undefined) item.sku = dto.sku?.trim() || '';
    const saved = await this.materialsRepo.save(item);
    this.realtime.emitTableUpdated('materials');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.materialsRepo.softRemove(item);
    this.realtime.emitTableUpdated('materials');
    return { success: true };
  }

  async removeMany(ids: string[]) {
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 1000 ||
      ids.some((id) => typeof id !== 'string' || !id.trim())
    ) {
      throw new BadRequestException('Select between 1 and 1000 material IDs.');
    }
    // One statement, preserving IDs and all historical references.
    const result = await this.materialsRepo.softDelete({
      id: In([...new Set(ids)]),
      deletedAt: IsNull(),
    });
    this.realtime.emitTableUpdated('materials');
    return { success: true, deletedCount: result.affected || 0 };
  }
}
