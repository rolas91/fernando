import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { CommercialCatalogItem } from '../../../entities/commercial-catalog-item.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateCommercialCatalogItemDto } from '../dto/create-commercial-catalog-item.dto';
import { UpdateCommercialCatalogItemDto } from '../dto/update-commercial-catalog-item.dto';

@Injectable()
export class CommercialCatalogItemsService {
  constructor(
    @InjectRepository(CommercialCatalogItem)
    private readonly repo: Repository<CommercialCatalogItem>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.repo.find({ order: { sku: 'ASC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Catalog item ${id} not found`);
    return item;
  }

  async create(dto: CreateCommercialCatalogItemDto) {
    const sku = dto.sku.trim();
    const exists = await this.repo.findOne({ where: { sku } });
    if (exists) throw new BadRequestException(`SKU ${sku} already exists.`);
    const saved = await this.repo.save(this.repo.create({
      id: dto.id?.trim() || `cci_${randomUUID()}`,
      sku,
      description: dto.description.trim(),
      type: dto.type?.trim() || '',
      dailyRate: dto.dailyRate,
      itemPrice: dto.itemPrice ?? 0,
      unit: dto.unit?.trim() || 'Each',
      status: dto.status?.trim() || 'active',
      notes: dto.notes?.trim() || '',
    }));
    this.realtime.emitTableUpdated('commercial_catalog_items');
    return saved;
  }

  async update(id: string, dto: UpdateCommercialCatalogItemDto) {
    const item = await this.findOne(id);
    if (dto.sku !== undefined) item.sku = dto.sku.trim();
    if (dto.description !== undefined) item.description = dto.description.trim();
    if (dto.type !== undefined) item.type = dto.type.trim();
    if (dto.dailyRate !== undefined) item.dailyRate = dto.dailyRate;
    if (dto.itemPrice !== undefined) item.itemPrice = dto.itemPrice;
    if (dto.unit !== undefined) item.unit = dto.unit.trim() || 'Each';
    if (dto.status !== undefined) item.status = dto.status.trim() || 'active';
    if (dto.notes !== undefined) item.notes = dto.notes.trim();
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('commercial_catalog_items');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('commercial_catalog_items');
    return { success: true };
  }
}
