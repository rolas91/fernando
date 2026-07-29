import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { randomBytes } from 'crypto';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { Repository } from 'typeorm';
import { ShiftAssignmentConfirmation } from '../../entities/shift-assignment-confirmation.entity';
import { Notification } from '../../entities/notification.entity';
import { WorkOrder } from '../../entities/work-order.entity';
import { Worker } from '../../entities/worker.entity';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ShiftsQueryService } from '../operations/services/shifts-query.service';
import { WorkOrderShiftsWriteService } from '../operations/services/work-order-shifts-write.service';

type GeocodeInput = {
  id: string;
  name: string;
  location: string;
  city: string;
  status: string;
  clientName: string;
};

type NotificationBody = {
  action?: 'send_sms' | 'send_whatsapp' | 'send_email' | 'send_in_app';
  title?: string;
  phone?: string;
  message?: string;
  workerName?: string;
  email?: string;
  confirmation?: {
    workOrderId?: string;
    shiftId?: string;
    roleId?: string;
    workerId?: string;
    projectName?: string;
    shiftDate?: string;
    shiftTime?: string;
    location?: string;
  };
};

type ConfirmationRenderResult = {
  httpStatus: number;
  state: 'confirmed' | 'already_confirmed' | 'invalid';
  title: string;
  description: string;
  workerName?: string;
  projectName?: string;
  shiftDate?: string;
  shiftTime?: string;
  roleName?: string;
};

type PreparedConfirmationRequest = {
  workOrderId: string;
  shiftId: string;
  roleId: string;
  workerId: string;
  token: string;
  deliveryChannel: string;
  recipient: string | null;
  requestedAtIso: string;
  message: string;
  providerMessageSid?: string | null;
};

type NotificationResult = {
  success: boolean;
  simulated: boolean;
  channel: string;
  note?: string;
  error?: string;
  messageSid?: string;
  messageId?: string;
  confirmationUrl?: string;
  twilioStatus?: string;
  twilioErrorCode?: string | null;
  twilioErrorMessage?: string | null;
};

type TwilioStatusCallbackPayload = {
  MessageSid?: string;
  MessageStatus?: string;
  To?: string;
  From?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  SmsSid?: string;
  SmsStatus?: string;
  ChannelStatusMessage?: string;
};

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    @InjectRepository(ShiftAssignmentConfirmation)
    private readonly confirmationsRepo: Repository<ShiftAssignmentConfirmation>,
    @InjectRepository(WorkOrder)
    private readonly workOrdersRepo: Repository<WorkOrder>,
    @InjectRepository(Worker)
    private readonly workersRepo: Repository<Worker>,
    @InjectRepository(Notification)
    private readonly notificationsRepo: Repository<Notification>,
    private readonly realtime: RealtimeGateway,
    private readonly shiftsQuery: ShiftsQueryService,
    private readonly shiftsWrite: WorkOrderShiftsWriteService,
  ) {}

  async geocodeJobs(locations: GeocodeInput[]) {
    const provider = (
      process.env.GEOCODING_PROVIDER || 'placeholder'
    ).toLowerCase();
    const key = process.env.GEOCODING_API_KEY || '';

    if (!key || provider === 'placeholder') {
      return {
        success: true,
        simulated: true,
        locations: locations.map((l) => ({ ...l, lat: null, lng: null })),
      };
    }

    const geocoded = await Promise.all(
      locations.map(async (l) => {
        const query = encodeURIComponent(`${l.location}, ${l.city}`);
        const url =
          provider === 'mapbox'
            ? `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?limit=1&access_token=${key}`
            : `https://api.opencagedata.com/geocode/v1/json?q=${query}&key=${key}&limit=1`;

        try {
          const res = await fetch(url);
          if (!res.ok) return { ...l, lat: null, lng: null };
          const data = (await res.json()) as Record<string, unknown>;
          if (provider === 'mapbox') {
            const features = (data.features || []) as Array<{
              center?: [number, number];
            }>;
            const center = features[0]?.center;
            return { ...l, lat: center?.[1] ?? null, lng: center?.[0] ?? null };
          }
          const results = (data.results || []) as Array<{
            geometry?: { lat?: number; lng?: number };
          }>;
          return {
            ...l,
            lat: results[0]?.geometry?.lat ?? null,
            lng: results[0]?.geometry?.lng ?? null,
          };
        } catch {
          return { ...l, lat: null, lng: null };
        }
      }),
    );

    return { success: true, simulated: false, provider, locations: geocoded };
  }

  async notifyWorkOrderAccessChange(input: {
    workOrderId: string;
    shiftId: string;
    roleId?: string;
    workerId: string;
    workOrderName: string;
    shiftDate: string;
    granted: boolean;
  }) {
    const worker = await this.workersRepo.findOne({
      where: { id: input.workerId },
    });
    if (!worker) return null;

    const title = input.granted
      ? 'Work Order access granted'
      : 'Work Order access removed';
    const datePhrase = input.shiftDate ? ` on ${input.shiftDate}` : '';
    const message = input.granted
      ? `You can now complete the timesheet and submit the Work Order for ${input.workOrderName}${datePhrase}.`
      : `Your access to complete the timesheet and submit the Work Order for ${input.workOrderName}${datePhrase} has been removed. Your shift assignment has not changed.`;
    const result = await this.sendFirebaseCloudMessage({
      action: 'send_in_app',
      title,
      message,
      email: worker.email,
      workerName: `${worker.firstName} ${worker.lastName}`.trim(),
      confirmation: {
        workOrderId: input.workOrderId,
        shiftId: input.shiftId,
        roleId: input.roleId,
        workerId: input.workerId,
        shiftDate: input.shiftDate,
      },
    });
    const deliveryStatus = result.success
      ? result.simulated
        ? 'simulated'
        : 'sent'
      : 'failed';

    const saved = await this.notificationsRepo.save(
      this.notificationsRepo.create({
        id: `notif_${randomBytes(12).toString('hex')}`,
        type: input.granted
          ? 'work_order_access_granted'
          : 'work_order_access_removed',
        channel: 'in_app',
        title,
        message,
        timestamp: new Date(),
        read: false,
        link: input.workOrderId,
        workerId: input.workerId,
        workOrderId: input.workOrderId,
        shiftId: input.shiftId,
        roleId: input.roleId || null,
        deliveryStatus,
        providerMessageId: result.messageId || result.error || null,
      }),
    );
    this.realtime.emitTableUpdated('notifications');
    return saved;
  }

  async sendNotification(body: NotificationBody, baseUrl: string) {
    const action = body.action || 'send_in_app';
    const prepared = await this.prepareNotification(body, baseUrl, action);
    const result: NotificationResult =
      action === 'send_sms'
        ? await this.sendSms(prepared)
        : action === 'send_whatsapp'
          ? await this.sendWhatsApp(prepared)
          : action === 'send_email'
            ? await this.sendEmail(prepared)
            : await this.sendFirebaseCloudMessage(prepared);

    if (action === 'send_in_app') {
      await this.persistFcmNotification(prepared, result);
    }

    if (prepared.confirmationRequest && result?.success) {
      prepared.confirmationRequest.providerMessageSid =
        result.messageSid || null;
      await this.persistConfirmationRequest(prepared.confirmationRequest);
    }

    return result;
  }

  async notifyShiftCancellation(workOrderId: string, shiftId: string) {
    const workOrder = await this.workOrdersRepo.findOne({ where: { id: workOrderId } });
    if (!workOrder) return { attempted: 0, sent: 0 };

    const shifts = await this.shiftsQuery.loadShiftsForWorkOrder(workOrderId);
    const shift = (shifts || []).find((item: any) => item.id === shiftId) as any;
    if (!shift) return { attempted: 0, sent: 0 };

    const workersById = new Map<string, { startTime: string }>();
    for (const role of shift.roles || []) {
      const startTime = role.startTime || shift.defaultRoleStartTime || shift.startTime;
      for (const workerId of role.assignedWorkers || []) {
        if (!workersById.has(workerId)) workersById.set(workerId, { startTime });
      }
    }

    let sent = 0;
    for (const [workerId, details] of workersById) {
      const worker = await this.workersRepo.findOne({ where: { id: workerId } });
      if (!worker) continue;
      const message = `Shift Cancelled\n\nYour scheduled shift for ${workOrder.title} on ${shift.date} at ${details.startTime} has been cancelled.\n\nYou are no longer assigned to this shift. If you have any questions, please contact dispatch`;
      const result = await this.sendNotification(
        {
          action: 'send_in_app',
          email: worker.email,
          workerName: `${worker.firstName} ${worker.lastName}`,
          message,
        },
        '',
      );
      if (result.success) sent += 1;
    }

    return { attempted: workersById.size, sent };
  }

  async sendChatPushNotification(params: {
    workerId: string;
    title: string;
    body: string;
    workOrderId: string;
    shiftId: string;
    shiftDate?: string;
    messageId: string;
    senderName: string;
  }): Promise<NotificationResult> {
    const worker = await this.workersRepo.findOne({ where: { id: params.workerId } });
    const tokens = (worker?.fcmTokens || []).filter((token) => token.trim());
    if (tokens.length === 0) {
      return {
        success: true,
        simulated: true,
        channel: 'in_app',
        note: 'FCM simulated because the worker has no registered device token.',
      };
    }

    const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t));
    if (validTokens.length === 0) {
      return {
        success: true,
        simulated: true,
        channel: 'in_app',
        note: 'Push simulated because no valid Expo push tokens found.',
      };
    }

    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      sound: 'default',
      title: params.title,
      body: params.body,
      data: {
        type: 'shift_chat_message',
        channel: 'shift_chat',
        workOrderId: params.workOrderId,
        shiftId: params.shiftId,
        shiftDate: params.shiftDate || '',
        messageId: params.messageId,
        senderName: params.senderName,
      },
      channelId: 'shift_notifications',
      priority: 'high',
      badge: 1,
    }));

    const expo = new Expo();
    const chunks = expo.chunkPushNotifications(messages);
    const sendResults: { ok: boolean; name?: string; error?: string }[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        for (const ticket of ticketChunk) {
          if (ticket.status === 'error') {
            sendResults.push({ ok: false, error: ticket.message });
          } else {
            sendResults.push({ ok: true, name: ticket.id });
          }
        }
      } catch (err) {
        sendResults.push({ ok: false, error: String(err) });
      }
    }

    const sent = sendResults.filter((item) => item.ok);
    if (sent.length === 0) {
      return {
        success: false,
        simulated: false,
        channel: 'in_app',
        error: sendResults.find((item) => !item.ok)?.error || 'Expo Push rejected all chat messages.',
      };
    }

    return {
      success: true,
      simulated: false,
      channel: 'in_app',
      messageId: sent.map((item) => item.name).filter(Boolean).join(','),
    };
  }

  async handleTwilioStatusCallback(payload: TwilioStatusCallbackPayload) {
    const messageSid = payload.MessageSid || payload.SmsSid || null;
    const status = payload.MessageStatus || payload.SmsStatus || null;
    const errorParts = [payload.ErrorCode, payload.ErrorMessage].filter(Boolean);
    const errorMessage =
      errorParts.length > 0 ? errorParts.join(': ') : null;

    this.logger.log(
      `Twilio status callback received sid=${messageSid || 'unknown'} status=${status || 'unknown'} to=${payload.To || 'unknown'} error=${errorMessage || 'none'}`,
    );

    if (!messageSid) {
      return {
        success: true,
        updated: false,
        reason: 'missing_message_sid',
      };
    }

    const confirmation = await this.confirmationsRepo.findOne({
      where: { providerMessageSid: messageSid },
    });

    if (!confirmation) {
      this.logger.warn(
        `Twilio callback sid=${messageSid} did not match any tracked confirmation.`,
      );
      return {
        success: true,
        updated: false,
        reason: 'confirmation_not_found',
      };
    }

    confirmation.deliveryStatus = status;
    confirmation.deliveryError = errorMessage;
    if (status === 'delivered') {
      confirmation.deliveredAt = new Date();
    }
    await this.confirmationsRepo.save(confirmation);

    this.logger.log(
      `Twilio delivery state persisted sid=${messageSid} status=${status || 'unknown'} confirmationId=${confirmation.id}`,
    );

    return {
      success: true,
      updated: true,
      messageSid,
      status,
    };
  }

  async confirmShiftAssignment(token: string): Promise<ConfirmationRenderResult> {
    const confirmation = await this.confirmationsRepo.findOne({ where: { token } });
    if (!confirmation) {
      return {
        httpStatus: 404,
        state: 'invalid',
        title: 'Confirmation link invalid',
        description: 'This confirmation link does not exist or is no longer available.',
      };
    }

    const workOrder = await this.workOrdersRepo.findOne({
      where: { id: confirmation.workOrderId },
    });
    if (!workOrder) {
      return {
        httpStatus: 404,
        state: 'invalid',
        title: 'Shift not found',
        description: 'The linked assignment no longer exists, so this confirmation cannot be applied.',
      };
    }

    const shifts = (await this.shiftsQuery.loadShiftsForWorkOrder(
      workOrder.id,
    )) ?? [];
    const shift = shifts.find((item: any) => item?.id === confirmation.shiftId) as
      | Record<string, any>
      | undefined;
    const role = Array.isArray(shift?.roles)
      ? shift?.roles.find((item: any) => item?.id === confirmation.roleId)
      : undefined;
    const assignedWorkers = Array.isArray(role?.assignedWorkers)
      ? role.assignedWorkers
      : [];
    const worker = await this.workersRepo.findOne({
      where: { id: confirmation.workerId },
    });
    const workerName = worker
      ? `${worker.firstName} ${worker.lastName}`
      : 'Worker';

    if (!shift || !role || !assignedWorkers.includes(confirmation.workerId)) {
      return {
        httpStatus: 409,
        state: 'invalid',
        title: 'Assignment changed',
        description: 'This worker is no longer assigned to that shift, so the confirmation was not applied.',
        workerName,
      };
    }

    const alreadyConfirmed = confirmation.status === 'confirmed';
    if (!alreadyConfirmed) {
      const respondedAt = new Date();
      confirmation.status = 'confirmed';
      confirmation.respondedAt = respondedAt;
      await this.confirmationsRepo.save(confirmation);

      await this.shiftsWrite.updateWorkerConfirmation({
        workOrderId: workOrder.id,
        shiftId: confirmation.shiftId,
        roleId: confirmation.roleId,
        workerId: confirmation.workerId,
        status: 'confirmed',
        respondedAt: respondedAt.toISOString(),
      });

      this.realtime.emitTableUpdated('work_orders');
    }

    return {
      httpStatus: 200,
      state: alreadyConfirmed ? 'already_confirmed' : 'confirmed',
      title: alreadyConfirmed
        ? 'Shift already confirmed'
        : 'Shift confirmed successfully',
      description: alreadyConfirmed
        ? 'This shift was already confirmed earlier.'
        : 'Your confirmation was saved and the schedule has been updated.',
      workerName,
      projectName: workOrder.title,
      shiftDate: typeof shift.date === 'string' ? shift.date : undefined,
      shiftTime:
        typeof shift.startTime === 'string' && typeof shift.endTime === 'string'
          ? `${shift.startTime} - ${shift.endTime}`
          : undefined,
      roleName: typeof role.roleName === 'string' ? role.roleName : undefined,
    };
  }

  renderConfirmationHtml(result: ConfirmationRenderResult) {
    const accent =
      result.state === 'confirmed'
        ? '#16a34a'
        : result.state === 'already_confirmed'
          ? '#2563eb'
          : '#dc2626';
    const bg =
      result.state === 'invalid'
        ? '#fef2f2'
        : result.state === 'already_confirmed'
          ? '#eff6ff'
          : '#f0fdf4';
    const meta = [
      result.workerName,
      result.roleName,
      result.shiftDate,
      result.shiftTime,
      result.projectName,
    ].filter(Boolean);

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${this.escapeHtml(result.title)}</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; }
      .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .card { width: 100%; max-width: 560px; background: white; border-radius: 18px; box-shadow: 0 20px 50px rgba(15,23,42,.12); overflow: hidden; }
      .top { height: 8px; background: ${accent}; }
      .body { padding: 28px; }
      .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: ${bg}; color: ${accent}; font-weight: 700; font-size: 12px; }
      h1 { margin: 16px 0 10px; font-size: 28px; line-height: 1.15; }
      p { margin: 0; line-height: 1.6; color: #475569; }
      ul { margin: 18px 0 0; padding: 0; list-style: none; }
      li { padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-top: 10px; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="top"></div>
        <div class="body">
          <span class="badge">${this.escapeHtml(
            result.state === 'invalid'
              ? 'Unavailable'
              : result.state === 'already_confirmed'
                ? 'Already confirmed'
                : 'Confirmed',
          )}</span>
          <h1>${this.escapeHtml(result.title)}</h1>
          <p>${this.escapeHtml(result.description)}</p>
          ${
            meta.length > 0
              ? `<ul>${meta
                  .map((entry) => `<li>${this.escapeHtml(entry as string)}</li>`)
                  .join('')}</ul>`
              : ''
          }
        </div>
      </div>
    </div>
  </body>
</html>`;
  }

  private async prepareNotification(
    body: NotificationBody,
    baseUrl: string,
    action: 'send_sms' | 'send_whatsapp' | 'send_email' | 'send_in_app',
  ) {
    let message = body.message || 'Notification';
    let confirmationUrl: string | undefined;
    let confirmationRequest: PreparedConfirmationRequest | undefined;

    if (body.confirmation?.workOrderId && body.confirmation.shiftId && body.confirmation.roleId && body.confirmation.workerId) {
      const prepared = await this.prepareConfirmationLink(body, baseUrl, action);
      message = prepared.message;
      confirmationUrl = prepared.confirmationUrl;
      confirmationRequest = prepared.confirmationRequest;
    }

    return {
      ...body,
      baseUrl,
      message,
      confirmationUrl,
      confirmationRequest,
    };
  }

  private async prepareConfirmationLink(
    body: NotificationBody,
    baseUrl: string,
    action: 'send_sms' | 'send_whatsapp' | 'send_email' | 'send_in_app',
  ) {
    const confirmation = body.confirmation!;
    const workOrder = await this.workOrdersRepo.findOne({
      where: { id: confirmation.workOrderId! },
    });
    if (!workOrder) {
      throw new Error(`Assignment ${confirmation.workOrderId} was not found.`);
    }

    const shifts = (await this.shiftsQuery.loadShiftsForWorkOrder(
      workOrder.id,
    )) ?? [];
    const shift = shifts.find((item: any) => item?.id === confirmation.shiftId) as
      | Record<string, any>
      | undefined;
    const role = Array.isArray(shift?.roles)
      ? shift?.roles.find((item: any) => item?.id === confirmation.roleId)
      : undefined;
    const assignedWorkers = Array.isArray(role?.assignedWorkers)
      ? role.assignedWorkers
      : [];

    if (!shift || !role || !assignedWorkers.includes(confirmation.workerId)) {
      throw new Error('The selected worker is no longer assigned to that shift.');
    }

    const token = this.generateConfirmationToken();
    const recipient =
      action === 'send_sms' || action === 'send_whatsapp'
        ? body.phone || null
        : body.email || null;
    const confirmationUrl = `${baseUrl}/api/integrations/shift-confirmations/${token}`;
    const glue = body.message?.includes('\n') ? '\n\n' : ' ';
    const requestedAtIso = new Date().toISOString();

    return {
      confirmationUrl,
      message: `${body.message || 'Notification'}${glue}Confirm your shift here: ${confirmationUrl}`,
      confirmationRequest: {
        workOrderId: confirmation.workOrderId!,
        shiftId: confirmation.shiftId!,
        roleId: confirmation.roleId!,
        workerId: confirmation.workerId!,
        token,
        deliveryChannel: action.replace('send_', ''),
        recipient,
        requestedAtIso,
        message: body.message || 'Notification',
      },
    };
  }

  private async persistConfirmationRequest(
    request: PreparedConfirmationRequest,
  ) {
    const workOrder = await this.workOrdersRepo.findOne({
      where: { id: request.workOrderId },
    });
    if (!workOrder) return;

    let record = await this.confirmationsRepo.findOne({
      where: {
        workOrderId: request.workOrderId,
        shiftId: request.shiftId,
        roleId: request.roleId,
        workerId: request.workerId,
      },
    });

    if (!record) {
      record = this.confirmationsRepo.create({
        workOrderId: request.workOrderId,
        shiftId: request.shiftId,
        roleId: request.roleId,
        workerId: request.workerId,
      });
    }

    const wasConfirmed = record.status === 'confirmed';
    record.token = request.token;
    record.status = wasConfirmed ? 'confirmed' : 'pending';
    record.deliveryChannel = request.deliveryChannel;
    record.requestedAt = new Date(request.requestedAtIso);
    record.respondedAt = wasConfirmed ? record.respondedAt : null;
    record.lastMessage = request.message;
    record.lastSentTo = request.recipient;
    record.providerMessageSid = request.providerMessageSid || null;
    record.deliveryStatus = request.providerMessageSid ? 'accepted' : null;
    record.deliveryError = null;
    record.deliveredAt = null;
    await this.confirmationsRepo.save(record);

    await this.shiftsWrite.updateWorkerConfirmation({
      workOrderId: request.workOrderId,
      shiftId: request.shiftId,
      roleId: request.roleId,
      workerId: request.workerId,
      status: wasConfirmed ? 'confirmed' : 'pending',
      requestedAt: request.requestedAtIso,
      notificationChannel: request.deliveryChannel,
    });
    this.realtime.emitTableUpdated('work_orders');
  }

  private async persistFcmNotification(
    body: NotificationBody & { confirmationUrl?: string },
    result: NotificationResult,
  ) {
    const workerId = await this.resolveNotificationWorkerId(body);
    if (!workerId) return;

    const status = result.success
      ? result.simulated
        ? 'simulated'
        : 'sent'
      : 'failed';

    await this.notificationsRepo.save(
      this.notificationsRepo.create({
        id: `notif_${randomBytes(12).toString('hex')}`,
        type: 'shift_assignment',
        channel: 'in_app',
        title: 'Shift assignment notification',
        message: body.message || 'Notification',
        timestamp: new Date(),
        read: false,
        link: body.confirmation?.workOrderId || null,
        workerId,
        workOrderId: body.confirmation?.workOrderId || null,
        shiftId: body.confirmation?.shiftId || null,
        roleId: body.confirmation?.roleId || null,
        deliveryStatus: status,
        providerMessageId: result.messageId || null,
      }),
    );
    this.realtime.emitTableUpdated('notifications');
  }

  private async resolveNotificationWorkerId(body: NotificationBody) {
    if (body.confirmation?.workerId) return body.confirmation.workerId;
    if (!body.email) return null;
    const worker = await this.workersRepo.findOne({
      where: { email: body.email.trim().toLowerCase() },
    });
    return worker?.id || null;
  }

  private async sendSms(body: NotificationBody) {
    const sid = process.env.TWILIO_ACCOUNT_SID || '';
    const token = process.env.TWILIO_AUTH_TOKEN || '';
    const from = process.env.TWILIO_FROM_NUMBER || '';
    if (!body.phone) {
      return {
        success: false,
        simulated: false,
        channel: 'sms',
        error: 'Worker phone number is missing.',
      };
    }
    if (
      !sid ||
      !token ||
      !from ||
      sid.includes('placeholder') ||
      token.includes('placeholder')
    ) {
      return {
        success: true,
        simulated: true,
        channel: 'sms',
        note: `SMS simulated for ${body.phone || 'unknown phone'}`,
        confirmationUrl: (body as any).confirmationUrl,
      };
    }

    const to = body.phone || '';
    return this.twilioMessagesSend({
      body,
      sid,
      token,
      to,
      from,
      channel: 'sms',
    });
  }

  private async sendWhatsApp(body: NotificationBody) {
    const sid = process.env.TWILIO_ACCOUNT_SID || '';
    const token = process.env.TWILIO_AUTH_TOKEN || '';
    if (!body.phone) {
      return {
        success: false,
        simulated: false,
        channel: 'whatsapp',
        error: 'Worker phone number is missing.',
      };
    }
    if (
      !sid ||
      !token ||
      sid.includes('placeholder') ||
      token.includes('placeholder')
    ) {
      return {
        success: true,
        simulated: true,
        channel: 'whatsapp',
        note: `WhatsApp simulated for ${body.phone || 'unknown phone'}`,
        confirmationUrl: (body as any).confirmationUrl,
      };
    }

    const toWa = this.formatTwilioWhatsappParticipant(body.phone);
    const fromWa = this.resolveTwilioWhatsAppFromAddress();
    if (!toWa || !fromWa) {
      return {
        success: false,
        simulated: false,
        channel: 'whatsapp',
        error:
          'Invalid WhatsApp number. Set TWILIO_WHATSAPP_FROM (recommended) or a valid TWILIO_FROM_NUMBER for WhatsApp.',
      };
    }

    return this.twilioMessagesSend({
      body,
      sid,
      token,
      to: toWa,
      from: fromWa,
      channel: 'whatsapp',
    });
  }

  private formatTwilioWhatsappParticipant(raw: string | undefined): string | null {
    if (!raw?.trim()) return null;
    let s = raw.trim();
    const lowerPrefix = 'whatsapp:';
    if (s.toLowerCase().startsWith(lowerPrefix)) {
      s = s.slice(lowerPrefix.length).trim();
    }
    let e164 = s;
    if (!s.startsWith('+')) {
      const digits = s.replace(/\D/g, '');
      if (!digits) return null;
      e164 =
        digits.length === 10
          ? `+1${digits}`
          : digits.startsWith('1') && digits.length === 11
            ? `+${digits}`
            : `+${digits}`;
    }
    return `${lowerPrefix}${e164}`;
  }

  /** WhatsApp-enabled sender from env, or SMS From prefixed with whatsapp:. */
  private resolveTwilioWhatsAppFromAddress(): string {
    const explicit = (process.env.TWILIO_WHATSAPP_FROM || '').trim();
    const fallback = (process.env.TWILIO_FROM_NUMBER || '').trim();
    return (
      this.formatTwilioWhatsappParticipant(explicit || fallback) || ''
    );
  }

  /** Twilio/WhatsApp: max length per Content variable (see Content API docs). */
  private capContentVar(value: string): string {
    const max = Number(process.env.TWILIO_WHATSAPP_CONTENT_VAR_MAX_LEN || 1600);
    const n = Number.isFinite(max) && max > 0 ? Math.min(max, 4096) : 1600;
    return value.slice(0, n);
  }

  /**
   * Builds ContentVariables for an approved WhatsApp Content template (fixes error 63016 outside 24h session).
   * TWILIO_WHATSAPP_TEMPLATE_VAR_MODE:
   * - full (default): {"1": entire message} — template body must use a single variable for the text.
   * - split: {"1": workerName, "2": message without link line, "3": confirmation URL} — match a 3-variable template.
   */
  private buildWhatsAppContentVariables(
    body: NotificationBody & { confirmationUrl?: string },
  ): Record<string, string> {
    const mode = (process.env.TWILIO_WHATSAPP_TEMPLATE_VAR_MODE || 'full')
      .trim()
      .toLowerCase();
    const msg = (body.message || 'Notification').trim();
    const url = (body as { confirmationUrl?: string }).confirmationUrl?.trim() || '';
    const name = (body.workerName || 'Worker').trim();

    if (mode === 'split') {
      let textWithoutLink = msg;
      if (url && msg.includes(url)) {
        textWithoutLink = msg.replace(url, '').trim();
        textWithoutLink = textWithoutLink.replace(/\s*Confirm your shift here:\s*$/i, '').trim();
      }
      return {
        '1': this.capContentVar(name),
        '2': this.capContentVar(textWithoutLink || msg),
        '3': this.capContentVar(url),
      };
    }

    return { '1': this.capContentVar(msg) };
  }

  private async twilioMessagesSend(opts: {
    body: NotificationBody & { confirmationUrl?: string; baseUrl?: string };
    sid: string;
    token: string;
    to: string;
    from: string;
    channel: 'sms' | 'whatsapp';
  }): Promise<NotificationResult> {
    const { body, sid, token, to, from, channel } = opts;
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const statusCallbackUrl = this.resolveTwilioStatusCallbackUrl(
      (body as any).baseUrl,
    );
    const params = new URLSearchParams();
    params.set('To', to);
    params.set('From', from);

    const whatsappTemplateSid =
      channel === 'whatsapp'
        ? (process.env.TWILIO_WHATSAPP_CONTENT_SID || '').trim()
        : '';

    if (whatsappTemplateSid) {
      const vars = this.buildWhatsAppContentVariables(body);
      params.set('ContentSid', whatsappTemplateSid);
      params.set('ContentVariables', JSON.stringify(vars));
      this.logger.log(
        `Twilio WhatsApp using ContentSid template mode keys=${Object.keys(vars).join(',')} to=${to}`,
      );
    } else {
      params.set('Body', body.message || 'Notification');
    }

    if (statusCallbackUrl) {
      params.set('StatusCallback', statusCallbackUrl);
    }
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const failureBody = await res.text();
      this.logger.error(
        `Twilio rejected ${channel} to=${to} status=${res.status} body=${failureBody || 'empty'}`,
      );
      return {
        success: false,
        simulated: false,
        channel,
        error: failureBody || `Twilio error ${res.status}`,
      };
    }
    const responseBody = (await res.json()) as {
      sid?: string;
      status?: string;
      error_code?: string | null;
      error_message?: string | null;
    };
    this.logger.log(
      `Twilio accepted ${channel} sid=${responseBody.sid || 'unknown'} status=${responseBody.status || 'unknown'} to=${to} callback=${statusCallbackUrl || 'disabled'}`,
    );
    return {
      success: true,
      simulated: false,
      channel,
      messageSid: responseBody.sid,
      twilioStatus: responseBody.status,
      twilioErrorCode: responseBody.error_code,
      twilioErrorMessage: responseBody.error_message,
      confirmationUrl: (body as any).confirmationUrl,
    };
  }

  private async sendEmail(body: NotificationBody) {
    const host = process.env.SMTP_HOST || '';
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    const from = process.env.SMTP_FROM || 'no-reply@example.com';
    if (!body.email) {
      return {
        success: false,
        simulated: false,
        channel: 'email',
        error: 'Worker email is missing.',
      };
    }
    if (!host || !user || !pass || host.includes('placeholder') || user.includes('placeholder')) {
      return {
        success: true,
        simulated: true,
        channel: 'email',
        note: `Email simulated for ${body.workerName || body.email || 'worker'}`,
        confirmationUrl: (body as any).confirmationUrl,
      };
    }

    const transportOptions: SMTPTransport.Options = {
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    };
    const transporter = nodemailer.createTransport(transportOptions);

    const info = await transporter.sendMail({
      from,
      to: body.email,
      subject: 'Shift assignment confirmation',
      text: body.message || 'Notification',
    });

    return {
      success: true,
      simulated: false,
      channel: 'email',
      messageId: info.messageId,
      confirmationUrl: (body as any).confirmationUrl,
    };
  }

  private async sendFirebaseCloudMessage(
    body: NotificationBody & { confirmationUrl?: string },
  ): Promise<NotificationResult> {
    const tokens = await this.resolveFcmTokens(body);
    if (tokens.length === 0) {
      return {
        success: true,
        simulated: true,
        channel: 'in_app',
        note: 'Push simulated because the worker has no registered device token.',
        confirmationUrl: body.confirmationUrl,
      };
    }

    const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t));
    if (validTokens.length === 0) {
      return {
        success: true,
        simulated: true,
        channel: 'in_app',
        note: 'Push simulated because no valid Expo push tokens found.',
        confirmationUrl: body.confirmationUrl,
      };
    }

    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      sound: 'default',
      title: body.title || 'Shift assignment notification',
      body: body.message || 'Notification',
      data: {
        channel: 'in_app',
        workOrderId: body.confirmation?.workOrderId || '',
        shiftId: body.confirmation?.shiftId || '',
        roleId: body.confirmation?.roleId || '',
        workerId: body.confirmation?.workerId || '',
        confirmationUrl: body.confirmationUrl || '',
      },
      channelId: 'shift_notifications',
      priority: 'high',
      badge: 1,
    }));

    const expo = new Expo();
    const chunks = expo.chunkPushNotifications(messages);
    const sendResults: { ok: boolean; name?: string; error?: string }[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        for (const ticket of ticketChunk) {
          if (ticket.status === 'error') {
            sendResults.push({ ok: false, error: ticket.message });
          } else {
            sendResults.push({ ok: true, name: ticket.id });
          }
        }
      } catch (err) {
        sendResults.push({ ok: false, error: String(err) });
      }
    }

    const sent = sendResults.filter((item) => item.ok);
    if (sent.length === 0) {
      return {
        success: false,
        simulated: false,
        channel: 'in_app',
        error:
          sendResults.find((item) => !item.ok)?.error ||
          'Expo Push rejected all messages.',
        confirmationUrl: body.confirmationUrl,
      };
    }

    return {
      success: true,
      simulated: false,
      channel: 'in_app',
      messageId: sent.map((item) => item.name).filter(Boolean).join(','),
      confirmationUrl: body.confirmationUrl,
    };
  }

  private async resolveFcmTokens(body: NotificationBody) {
    const workerId = body.confirmation?.workerId;
    const where = workerId
      ? { id: workerId }
      : body.email
        ? { email: body.email.trim().toLowerCase() }
        : null;
    if (!where) return [];

    const worker = await this.workersRepo.findOne({ where });
    return (worker?.fcmTokens || []).filter((token) => token.trim());
  }

  private generateConfirmationToken() {
    return randomBytes(24).toString('hex');
  }

  private resolveTwilioStatusCallbackUrl(baseUrl?: string) {
    const explicit = (process.env.TWILIO_STATUS_CALLBACK_URL || '').trim();
    if (explicit) return explicit;
    if (!baseUrl) return null;
    if (
      baseUrl.includes('localhost') ||
      baseUrl.includes('127.0.0.1') ||
      baseUrl.includes('0.0.0.0')
    ) {
      this.logger.warn(
        `Twilio status callback disabled because baseUrl is not public: ${baseUrl}`,
      );
      return null;
    }
    return `${baseUrl}/api/integrations/twilio/status`;
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
