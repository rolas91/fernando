import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { ShiftAssignmentConfirmation } from '../../entities/shift-assignment-confirmation.entity';
import { WorkOrder } from '../../entities/work-order.entity';
import { Worker } from '../../entities/worker.entity';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  normalizeWorkOrderShifts,
  updateShiftWorkerConfirmation,
} from '../operations/utils/work-order-shifts.util';

type GeocodeInput = {
  id: string;
  name: string;
  location: string;
  city: string;
  status: string;
  clientName: string;
};

type NotificationBody = {
  action?: 'send_sms' | 'send_email' | 'send_in_app';
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
    private readonly realtime: RealtimeGateway,
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

  async sendNotification(body: NotificationBody, baseUrl: string) {
    const action = body.action || 'send_in_app';
    const prepared = await this.prepareNotification(body, baseUrl, action);
    const result: NotificationResult =
      action === 'send_sms'
        ? await this.sendSms(prepared)
        : action === 'send_email'
          ? await this.sendEmail(prepared)
          : {
              success: true,
              simulated: true,
              channel: 'in_app',
              note: 'In-app notification simulated',
              confirmationUrl: prepared.confirmationUrl,
            };

    if (prepared.confirmationRequest && result?.success) {
      prepared.confirmationRequest.providerMessageSid =
        result.messageSid || null;
      await this.persistConfirmationRequest(prepared.confirmationRequest);
    }

    return result;
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
        description: 'The linked work order no longer exists, so this confirmation cannot be applied.',
      };
    }

    workOrder.shifts = normalizeWorkOrderShifts(workOrder.shifts);
    const shift = workOrder.shifts.find((item: any) => item?.id === confirmation.shiftId) as
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

      workOrder.shifts = updateShiftWorkerConfirmation(
        workOrder.shifts,
        {
          shiftId: confirmation.shiftId,
          roleId: confirmation.roleId,
          workerId: confirmation.workerId,
        },
        {
          status: 'confirmed',
          respondedAt: respondedAt.toISOString(),
        },
      );

      await this.workOrdersRepo.save(workOrder);
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
        : 'Your confirmation was saved and the scheduler has been updated.',
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
    action: 'send_sms' | 'send_email' | 'send_in_app',
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
    action: 'send_sms' | 'send_email' | 'send_in_app',
  ) {
    const confirmation = body.confirmation!;
    const workOrder = await this.workOrdersRepo.findOne({
      where: { id: confirmation.workOrderId! },
    });
    if (!workOrder) {
      throw new Error(`Work order ${confirmation.workOrderId} was not found.`);
    }

    workOrder.shifts = normalizeWorkOrderShifts(workOrder.shifts);
    const shift = workOrder.shifts.find((item: any) => item?.id === confirmation.shiftId) as
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
      action === 'send_sms' ? body.phone || null : body.email || null;
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

    record.token = request.token;
    record.status = 'pending';
    record.deliveryChannel = request.deliveryChannel;
    record.requestedAt = new Date(request.requestedAtIso);
    record.respondedAt = null;
    record.lastMessage = request.message;
    record.lastSentTo = request.recipient;
    record.providerMessageSid = request.providerMessageSid || null;
    record.deliveryStatus = request.providerMessageSid ? 'accepted' : null;
    record.deliveryError = null;
    record.deliveredAt = null;
    await this.confirmationsRepo.save(record);

    workOrder.shifts = updateShiftWorkerConfirmation(
      normalizeWorkOrderShifts(workOrder.shifts),
      {
        shiftId: request.shiftId,
        roleId: request.roleId,
        workerId: request.workerId,
      },
      {
        status: 'pending',
        requestedAt: request.requestedAtIso,
        respondedAt: undefined,
        notificationChannel: request.deliveryChannel,
      },
    );
    await this.workOrdersRepo.save(workOrder);
    this.realtime.emitTableUpdated('work_orders');
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
    if (!sid || !token || !from || sid.includes('placeholder') || token.includes('placeholder')) {
      return {
        success: true,
        simulated: true,
        channel: 'sms',
        note: `SMS simulated for ${body.phone || 'unknown phone'}`,
        confirmationUrl: (body as any).confirmationUrl,
      };
    }

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const statusCallbackUrl = this.resolveTwilioStatusCallbackUrl(
      (body as any).baseUrl,
    );
    const params = new URLSearchParams();
    params.set('To', body.phone || '');
    params.set('From', from);
    params.set('Body', body.message || 'Notification');
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
        `Twilio rejected sms to=${body.phone || 'unknown'} status=${res.status} body=${failureBody || 'empty'}`,
      );
      return {
        success: false,
        simulated: false,
        channel: 'sms',
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
      `Twilio accepted sms sid=${responseBody.sid || 'unknown'} status=${responseBody.status || 'unknown'} to=${body.phone || 'unknown'} callback=${statusCallbackUrl || 'disabled'}`,
    );
    return {
      success: true,
      simulated: false,
      channel: 'sms',
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
