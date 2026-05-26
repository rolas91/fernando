import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../../../entities/notification.entity';
import { Worker } from '../../../entities/worker.entity';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import type { UserAccessContext } from '../../access/ports/access.port';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { UpdateNotificationDto } from '../dto/update-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    @InjectRepository(Worker)
    private readonly workerRepo: Repository<Worker>,
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

  async findMobileForActor(actor: UserAccessContext | undefined) {
    const worker = await this.resolveWorkerForActor(actor);
    return this.repo.find({
      where: { workerId: worker.id, channel: 'in_app' },
      order: { timestamp: 'DESC', createdAt: 'DESC' },
      take: 50,
    });
  }

  async markMobileRead(id: string, actor: UserAccessContext | undefined) {
    const worker = await this.resolveWorkerForActor(actor);
    const item = await this.repo.findOne({ where: { id, workerId: worker.id } });
    if (!item) throw new NotFoundException(`Notification ${id} not found`);
    item.read = true;
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('notifications');
    return saved;
  }

  async removeMobile(id: string, actor: UserAccessContext | undefined) {
    const worker = await this.resolveWorkerForActor(actor);
    const item = await this.repo.findOne({ where: { id, workerId: worker.id } });
    if (!item) throw new NotFoundException(`Notification ${id} not found`);
    await this.repo.remove(item);
    this.realtime.emitTableUpdated('notifications');
    return { success: true };
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

  private async resolveWorkerForActor(actor: UserAccessContext | undefined) {
    const email = actor?.email?.trim().toLowerCase();
    if (!email) throw new NotFoundException('Authenticated worker not found.');
    const worker = await this.workerRepo.findOne({ where: { email } });
    if (!worker) throw new NotFoundException(`Worker profile for ${email} was not found.`);
    return worker;
  }
}
