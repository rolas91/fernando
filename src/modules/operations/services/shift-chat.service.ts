import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { ShiftChatMessage } from '../../../entities/shift-chat-message.entity';
import { WorkOrder } from '../../../entities/work-order.entity';
import { Worker } from '../../../entities/worker.entity';
import type { UserAccessContext } from '../../access/ports/access.port';
import { CreateShiftChatMessageDto } from '../dto/create-shift-chat-message.dto';
import { SpacesStorageService } from './spaces-storage.service';

@Injectable()
export class ShiftChatService {
  constructor(
    @InjectRepository(ShiftChatMessage)
    private readonly chatRepo: Repository<ShiftChatMessage>,
    @InjectRepository(WorkOrder)
    private readonly workOrdersRepo: Repository<WorkOrder>,
    @InjectRepository(Worker)
    private readonly workersRepo: Repository<Worker>,
    private readonly spacesStorage: SpacesStorageService,
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
      senderWorkerId: worker.id,
      senderName: `${worker.firstName} ${worker.lastName}`.trim() || worker.email,
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
    return this.serialize(saved);
  }

  async deleteMessage(
    actor: UserAccessContext | undefined,
    shiftId: string,
    messageId: string,
  ) {
    const { worker } = await this.assertActorCanAccessShift(actor, shiftId);
    const message = await this.chatRepo.findOne({
      where: { id: messageId, shiftId },
    });
    if (!message) {
      throw new NotFoundException('Chat message not found.');
    }
    if (message.senderWorkerId !== worker.id) {
      throw new ForbiddenException('Only the message sender can delete it.');
    }

    await this.chatRepo.delete({ id: message.id, shiftId });
    if (message.mediaUrl) {
      await this.spacesStorage.deleteManyPublicFiles([message.mediaUrl]);
    }
    return { id: message.id, shiftId };
  }

  async assertActorCanAccessShift(actor: UserAccessContext | undefined, shiftId: string) {
    const worker = await this.resolveWorkerForMobileUser(actor);
    const workOrder = await this.workOrdersRepo.findOne({ where: { id: await this.findWorkOrderIdForShift(shiftId) } });
    if (!workOrder) throw new NotFoundException(`Shift ${shiftId} not found.`);
    if (!this.workerAssignedToShift(workOrder, shiftId, worker.id)) {
      throw new ForbiddenException('Worker is not assigned to this shift chat.');
    }
    return { worker, workOrder };
  }

  private async findWorkOrderIdForShift(shiftId: string) {
    const workOrders = await this.workOrdersRepo.find();
    const found = workOrders.find((workOrder) =>
      (Array.isArray(workOrder.shifts) ? workOrder.shifts : []).some((shift) => {
        const record = shift as Record<string, unknown>;
        return record.id === shiftId;
      }),
    );
    if (!found) throw new NotFoundException(`Shift ${shiftId} not found.`);
    return found.id;
  }

  private async resolveWorkerForMobileUser(actor: UserAccessContext | undefined) {
    const email = actor?.email?.trim().toLowerCase();
    if (!email) throw new ForbiddenException('Authenticated user email is required.');
    const worker = await this.workersRepo.findOne({ where: { email } });
    if (!worker) {
      throw new ForbiddenException('No worker profile is linked to this user email.');
    }
    return worker;
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
