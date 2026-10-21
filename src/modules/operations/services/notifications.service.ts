import { ShiftCancellationConfirmation } from '../../../entities/shift-cancellation-confirmation.entity';
import { WorkOrderShift } from '../../../entities/work-order-shift.entity';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
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

  async findWebForActor(actor: UserAccessContext | undefined) {
    const notifications = await this.repo.find({
      where: { workerId: IsNull() },
      order: { timestamp: 'DESC', createdAt: 'DESC' },
      take: 100,
    });
    const ownChatMarker = `chat-sender:${actor?.id || ''}`;
    return notifications.filter(
      (notification) => notification.providerMessageId !== ownChatMarker,
    );
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
    const item = await this.repo.findOne({
      where: { id, workerId: worker.id },
    });
    if (!item) throw new NotFoundException(`Notification ${id} not found`);
    item.read = true;
    const saved = await this.repo.save(item);
    this.realtime.emitTableUpdated('notifications');
    return saved;
  }

  async acknowledgeCancellation(
    id: string,
    actor: UserAccessContext | undefined,
  ) {
    const worker = await this.resolveWorkerForActor(actor);
    const saved = await this.repo.manager.transaction(async (manager) => {
      const notifications = manager.getRepository(Notification);
      const item = await notifications.findOne({
        where: { id, workerId: worker.id },
      });
      if (!item) throw new NotFoundException('Notification not found.');
      if (
        item.type !== 'shift_cancelled' ||
        !item.shiftId ||
        !item.workOrderId
      ) {
        throw new BadRequestException(
          'This notification is not a shift cancellation.',
        );
      }
      const shift = await manager.getRepository(WorkOrderShift).findOne({
        where: { id: item.shiftId, workOrderId: item.workOrderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!shift?.cancelled)
        throw new BadRequestException('This shift is no longer cancelled.');
      const confirmations = manager.getRepository(
        ShiftCancellationConfirmation,
      );
      const confirmation = await confirmations.findOne({
        where: {
          workOrderId: item.workOrderId,
          shiftId: item.shiftId,
          workerId: worker.id,
          notificationId: id,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!confirmation)
        throw new BadRequestException(
          'This cancellation notification is no longer current.',
        );
      confirmation.acknowledgedAt ??= new Date();
      await confirmations.save(confirmation);
      item.acknowledgedAt = confirmation.acknowledgedAt;
      item.read = true;
      return notifications.save(item);
    });
    this.realtime.emitTableUpdated('notifications');
    this.realtime.emitTableUpdated('work_orders');
    return saved;
  }

  async removeMobile(id: string, actor: UserAccessContext | undefined) {
    const worker = await this.resolveWorkerForActor(actor);
    const item = await this.repo.findOne({
      where: { id, workerId: worker.id },
    });
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
    if (!worker)
      throw new NotFoundException(`Worker profile for ${email} was not found.`);
    return worker;
  }
}
