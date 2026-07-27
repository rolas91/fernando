import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { IsNull, Not, Repository } from 'typeorm';
import { Notification } from '../../../entities/notification.entity';
import { ShiftChatMessage } from '../../../entities/shift-chat-message.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { Worker } from '../../../entities/worker.entity';
import type { UserAccessContext } from '../../access/ports/access.port';
import { CreateShiftChatMessageDto } from '../dto/create-shift-chat-message.dto';
import { SpacesStorageService } from './spaces-storage.service';
import { IntegrationsService } from '../../integrations/integrations.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { ShiftsQueryService } from './shifts-query.service';
import { findWorkerForActor } from '../utils/worker-actor-lookup.util';

@Injectable()
export class ShiftChatService {
  constructor(
    @InjectRepository(ShiftChatMessage)
    private readonly chatRepo: Repository<ShiftChatMessage>,
    @InjectRepository(WorkOrder)
    private readonly workOrdersRepo: Repository<WorkOrder>,
    @InjectRepository(Worker)
    private readonly workersRepo: Repository<Worker>,
    @InjectRepository(Notification)
    private readonly notificationsRepo: Repository<Notification>,
    private readonly spacesStorage: SpacesStorageService,
    private readonly integrations: IntegrationsService,
    private readonly realtime: RealtimeGateway,
    private readonly shiftsQuery: ShiftsQueryService,
  ) {}

  async findMessages(actor: UserAccessContext | undefined, shiftId: string) {
    await this.assertActorCanAccessShift(actor, shiftId);
    const rows = await this.chatRepo.find({
      where: { shiftId },
      order: { createdAt: 'ASC' },
      take: 200,
    });
    return rows.map((row) => this.serialize(row));
  }

  async createMessage(
    actor: UserAccessContext | undefined,
    shiftId: string,
    dto: CreateShiftChatMessageDto,
  ) {
    const { worker, workOrder } = await this.assertActorCanAccessShift(actor, shiftId);
    const body = (dto.body || '').trim();
    const mediaUrl = (dto.mediaUrl || '').trim();
    const kind = dto.kind || (mediaUrl ? this.kindFromContentType(dto.mediaContentType) : 'text');
    if (!body && !mediaUrl) {
      throw new BadRequestException('Message body or media is required.');
    }
    if (kind !== 'text' && !mediaUrl) {
      throw new BadRequestException('Media messages require mediaUrl.');
    }

    const saved = await this.chatRepo.save({
      id: `scm_${randomUUID()}`,
      workOrderId: workOrder.id,
      shiftId,
      senderUserId: actor?.id || '',
      senderWorkerId: worker?.id || '',
      senderName:
        worker
          ? `${worker.firstName} ${worker.lastName}`.trim() || worker.email
          : `${actor?.firstName || ''} ${actor?.lastName || ''}`.trim() ||
            actor?.email ||
            'Scheduler',
      kind,
      body,
      mediaUrl,
      mediaName: (dto.mediaName || '').trim(),
      mediaContentType: (dto.mediaContentType || '').trim(),
      mediaSize: Number(dto.mediaSize) || 0,
      replyToMessageId: (dto.replyToMessageId || '').trim(),
      replyToSenderName: (dto.replyToSenderName || '').trim(),
      replyToKind: (dto.replyToKind || '').trim(),
      replyToPreview: (dto.replyToPreview || '').trim(),
    });
    const serialized = this.serialize(saved);
    await this.notifyShiftRecipients(
      workOrder,
      worker?.id || '',
      actor,
      serialized,
    );
    return serialized;
  }

  async unreadCount(actor: UserAccessContext | undefined, shiftId: string) {
    const { worker } = await this.assertActorCanAccessShift(actor, shiftId);
    if (!worker) {
      const count = await this.notificationsRepo.count({
        where: {
          workerId: IsNull(),
          shiftId,
          type: 'shift_chat_message',
          channel: 'web',
          read: false,
          providerMessageId: Not(`chat-sender:${actor?.id || ''}`),
        },
      });
      return { shiftId, unreadCount: count };
    }
    const count = await this.notificationsRepo.count({
      where: {
        workerId: worker.id,
        shiftId,
        type: 'shift_chat_message',
        channel: 'in_app',
        read: false,
      },
    });
    return { shiftId, unreadCount: count };
  }

  async markShiftRead(actor: UserAccessContext | undefined, shiftId: string) {
    const { worker } = await this.assertActorCanAccessShift(actor, shiftId);
    if (!worker) {
      await this.notificationsRepo.update(
        {
          workerId: IsNull(),
          shiftId,
          type: 'shift_chat_message',
          channel: 'web',
          read: false,
        },
        { read: true },
      );
      this.realtime.emitTableUpdated('notifications');
      return { shiftId, unreadCount: 0 };
    }
    await this.notificationsRepo.update(
      {
        workerId: worker.id,
        shiftId,
        type: 'shift_chat_message',
        channel: 'in_app',
        read: false,
      },
      { read: true },
    );
    this.realtime.emitTableUpdated('notifications');
    return { shiftId, unreadCount: 0 };
  }

  async deleteMessage(
    actor: UserAccessContext | undefined,
    shiftId: string,
    messageId: string,
  ) {
    await this.assertActorCanAccessShift(actor, shiftId);
    const message = await this.chatRepo.findOne({
      where: { id: messageId, shiftId },
    });
    if (!message) {
      throw new NotFoundException('Chat message not found.');
    }
    if (message.senderUserId !== actor?.id) {
      throw new ForbiddenException('Only the message sender can delete it.');
    }

    await this.chatRepo.delete({ id: message.id, shiftId });
    if (message.mediaUrl) {
      await this.spacesStorage.deleteManyPublicFiles([message.mediaUrl]);
    }
    return { id: message.id, shiftId };
  }

  async assertActorCanAccessShift(actor: UserAccessContext | undefined, shiftId: string) {
    const workOrderId = await this.findWorkOrderIdForShift(shiftId);
    const workOrder = await this.workOrdersRepo.findOne({ where: { id: workOrderId } });
    if (!workOrder) throw new NotFoundException(`Shift ${shiftId} not found.`);
    workOrder.shifts = (await this.shiftsQuery.loadShiftsForWorkOrder(workOrderId)) ?? [];
    const worker = await this.resolveWorkerForActor(actor);
    if (this.isPrivilegedChatActor(actor)) {
      return { worker, workOrder };
    }
    if (!worker) {
      throw new ForbiddenException('No worker profile is linked to this user email.');
    }
    if (!this.workerAssignedToShift(workOrder, shiftId, worker.id)) {
      throw new ForbiddenException('Worker is not assigned to this shift.');
    }
    return { worker, workOrder };
  }

  private async findWorkOrderIdForShift(shiftId: string) {
    const row = await this.workOrdersRepo
      .createQueryBuilder('wo')
      .select('wo.id', 'id')
      .where(
        'EXISTS (SELECT 1 FROM work_order_shifts ws WHERE ws.work_order_id = wo.id AND ws.id = :shiftId)',
      )
      .setParameter('shiftId', shiftId)
      .getRawOne<{ id: string }>();
    if (!row?.id) throw new NotFoundException(`Shift ${shiftId} not found.`);
    return row.id;
  }

  private async resolveWorkerForActor(actor: UserAccessContext | undefined) {
    return findWorkerForActor(this.workersRepo, actor);
  }

  private isPrivilegedChatActor(actor: UserAccessContext | undefined) {
    return actor?.role === 'admin' || actor?.role === 'manager' || actor?.role === 'scheduler';
  }

  private workerAssignedToShift(workOrder: WorkOrder, shiftId: string, workerId: string) {
    const shift = (Array.isArray(workOrder.shifts) ? workOrder.shifts : []).find((item) => {
      const record = item as Record<string, unknown>;
      return record.id === shiftId;
    }) as Record<string, unknown> | undefined;
    const roles = Array.isArray(shift?.roles) ? (shift.roles as Record<string, unknown>[]) : [];
    return roles.some((role) => {
      const assignedWorkers = Array.isArray(role.assignedWorkers)
        ? role.assignedWorkers
        : [];
      return assignedWorkers.includes(workerId);
    });
  }

  private assignedWorkerIdsForShift(workOrder: WorkOrder, shiftId: string) {
    const shift = (Array.isArray(workOrder.shifts) ? workOrder.shifts : []).find((item) => {
      const record = item as Record<string, unknown>;
      return record.id === shiftId;
    }) as Record<string, unknown> | undefined;
    const roles = Array.isArray(shift?.roles) ? (shift.roles as Record<string, unknown>[]) : [];
    const ids = new Set<string>();
    for (const role of roles) {
      const assignedWorkers = Array.isArray(role.assignedWorkers)
        ? role.assignedWorkers
        : [];
      for (const workerId of assignedWorkers) {
        if (typeof workerId === 'string' && workerId.trim()) ids.add(workerId);
      }
    }
    return [...ids];
  }

  private notificationBody(message: ReturnType<ShiftChatService['serialize']>) {
    if (message.body?.trim()) return message.body.trim().slice(0, 180);
    if (message.kind === 'image') return 'Sent a photo';
    if (message.kind === 'audio') return 'Sent a voice message';
    return 'Sent a message';
  }

  private async notifyShiftRecipients(
    workOrder: WorkOrder,
    senderWorkerId: string,
    actor: UserAccessContext | undefined,
    message: ReturnType<ShiftChatService['serialize']>,
  ) {
    const recipientIds = this.assignedWorkerIdsForShift(workOrder, message.shiftId)
      .filter((workerId) => workerId !== senderWorkerId);
    const body = this.notificationBody(message);
    const title = `${message.senderName || 'Shift chat'} sent a message`;
    const shiftDate = this.shiftDateForMessage(workOrder, message.shiftId);
    await this.notificationsRepo.save(this.notificationsRepo.create({
      id: `notif_${randomUUID()}`,
      type: 'shift_chat_message',
      channel: 'web',
      title,
      message: body,
      timestamp: new Date(),
      read: false,
      link: 'shift-chat',
      workerId: null,
      workOrderId: message.workOrderId,
      shiftId: message.shiftId,
      roleId: null,
      deliveryStatus: 'in_app',
      providerMessageId: `chat-sender:${actor?.id || ''}`,
    }));

    if (recipientIds.length === 0) {
      this.realtime.emitTableUpdated('notifications');
      return;
    }
    const notifications = await this.notificationsRepo.save(
      recipientIds.map((workerId) => this.notificationsRepo.create({
        id: `notif_${randomUUID()}`,
        type: 'shift_chat_message',
        channel: 'in_app',
        title,
        message: body,
        timestamp: new Date(),
        read: false,
        link: 'shift-chat',
        workerId,
        workOrderId: message.workOrderId,
        shiftId: message.shiftId,
        roleId: null,
        deliveryStatus: 'pending',
        providerMessageId: null,
      })),
    );

    this.realtime.emitTableUpdated('notifications');

    await Promise.all(
      notifications.map(async (notification) => {
        const result = await this.integrations.sendChatPushNotification({
          workerId: notification.workerId || '',
          title,
          body,
          workOrderId: message.workOrderId,
          shiftId: message.shiftId,
          shiftDate,
          messageId: message.id,
          senderName: message.senderName,
        });
        notification.deliveryStatus = result.simulated
          ? 'simulated'
          : result.success
            ? 'sent'
            : 'failed';
        notification.providerMessageId = result.messageId || result.error || null;
        await this.notificationsRepo.save(notification);
      }),
    );
  }

  private shiftDateForMessage(workOrder: WorkOrder, shiftId: string) {
    const shift = (Array.isArray(workOrder.shifts) ? workOrder.shifts : []).find((item) => {
      const record = item as Record<string, unknown>;
      return record.id === shiftId;
    }) as Record<string, unknown> | undefined;
    return typeof shift?.date === 'string' ? shift.date : undefined;
  }

  private kindFromContentType(contentType?: string) {
    const raw = (contentType || '').toLowerCase();
    if (raw.startsWith('image/')) return 'image';
    if (raw.startsWith('audio/') || raw.startsWith('video/')) return 'audio';
    return 'text';
  }

  private serialize(row: ShiftChatMessage) {
    return {
      id: row.id,
      workOrderId: row.workOrderId,
      shiftId: row.shiftId,
      senderUserId: row.senderUserId,
      senderWorkerId: row.senderWorkerId,
      senderName: row.senderName,
      kind: row.kind,
      body: row.body,
      mediaUrl: row.mediaUrl,
      mediaName: row.mediaName,
      mediaContentType: row.mediaContentType,
      mediaSize: row.mediaSize,
      replyToMessageId: row.replyToMessageId,
      replyToSenderName: row.replyToSenderName,
      replyToKind: row.replyToKind,
      replyToPreview: row.replyToPreview,
      createdAt: row.createdAt?.toISOString?.() || new Date().toISOString(),
    };
  }
}
