import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AvailabilityRequest } from '../../../entities/availability-request.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateAvailabilityRequestDto } from '../dto/create-availability-request.dto';
import { UpdateAvailabilityRequestDto } from '../dto/update-availability-request.dto';

@Injectable()
export class AvailabilityRequestsService {
  constructor(
    @InjectRepository(AvailabilityRequest)
    private readonly repo: Repository<AvailabilityRequest>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item)
      throw new NotFoundException(`Availability request ${id} not found`);
    return item;
  }

  create(dto: CreateAvailabilityRequestDto) {
    return this.repo
      .save(
        this.repo.create({
          ...dto,
          reviewedAt: dto.reviewedAt ? new Date(dto.reviewedAt) : undefined,
        }),
      )
      .then((saved) => {
        this.realtime.emitTableUpdated('availability_requests');
        return saved;
      });
  }

  async update(id: string, dto: UpdateAvailabilityRequestDto) {
    const item = await this.findOne(id);
    Object.assign(item, {
      ...dto,
      reviewedAt:
        dto.reviewedAt !== undefined ? new Date(dto.reviewedAt) : undefined,
    });
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('availability_requests');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('availability_requests');
    return { success: true };
  }
}
