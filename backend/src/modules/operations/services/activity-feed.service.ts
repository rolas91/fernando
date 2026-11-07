import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityFeedItem } from '../../../entities/activity-feed.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateActivityFeedItemDto } from '../dto/create-activity-feed-item.dto';
import { UpdateActivityFeedItemDto } from '../dto/update-activity-feed-item.dto';

@Injectable()
export class ActivityFeedService {
  constructor(
    @InjectRepository(ActivityFeedItem)
    private readonly repo: Repository<ActivityFeedItem>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.repo.find({ order: { timestamp: 'DESC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Activity item ${id} not found`);
    return item;
  }

  create(dto: CreateActivityFeedItemDto) {
    return this.repo
      .save(
        this.repo.create({
          ...dto,
          timestamp: dto.timestamp ? new Date(dto.timestamp) : undefined,
        }),
      )
      .then((saved) => {
        this.realtime.emitTableUpdated('activity_feed');
        return saved;
      });
  }

  async update(id: string, dto: UpdateActivityFeedItemDto) {
    const item = await this.findOne(id);
    Object.assign(item, {
      ...dto,
      timestamp:
        dto.timestamp !== undefined ? new Date(dto.timestamp) : undefined,
    });
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('activity_feed');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('activity_feed');
    return { success: true };
  }
}
