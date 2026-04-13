import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../../../entities/notification.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { UpdateNotificationDto } from '../dto/update-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    private readonly realtime: RealtimeGateway,
  ) {}

  findAll() {
    return this.repo.find({ order: { timestamp: 'DESC' } });
  }

  async findOne(id: string) {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Notification ${id} not found`);
    return item;
  }

  create(dto: CreateNotificationDto) {
    return this.repo
      .save(
        this.repo.create({
          ...dto,
          timestamp: dto.timestamp ? new Date(dto.timestamp) : undefined,
        }),
      )
      .then((saved) => {
        this.realtime.emitTableUpdated('notifications');
        return saved;
      });
  }

  async update(id: string, dto: UpdateNotificationDto) {
    const item = await this.findOne(id);
    Object.assign(item, {
      ...dto,
      timestamp:
        dto.timestamp !== undefined ? new Date(dto.timestamp) : undefined,
    });
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('notifications');
    return saved;
  }

  async remove(id: string) {
    const item = await this.findOne(id);
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('notifications');
    return { success: true };
  }
}
