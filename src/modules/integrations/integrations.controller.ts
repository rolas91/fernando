import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { GeocodeJobsDto } from './dto/geocode-jobs.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { IntegrationsService } from './integrations.service';
import { Expo } from 'expo-server-sdk';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker } from '../../entities/worker.entity';

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    @InjectRepository(Worker)
    private readonly workersRepo: Repository<Worker>,
  ) {}

  private resolveBaseUrl(req: Request) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
      .split(',')[0]
      .trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] || '')
      .split(',')[0]
      .trim();
    const protocol = forwardedProto || req.protocol || 'http';
    const host =
      forwardedHost || req.get('host') || `localhost:${process.env.PORT || 3000}`;
    return `${protocol}://${host}`;
  }

  @Post('geocode-jobs')
  @ApiBody({ type: GeocodeJobsDto })
  geocodeJobs(@Body() body: GeocodeJobsDto) {
    return this.integrationsService.geocodeJobs(body.locations || []);
  }

  @Post('send-notification')
  @ApiBody({ type: SendNotificationDto })
  @ApiOkResponse({
    description: 'Notification dispatch result including provider metadata.',
  })
  sendNotification(
    @Body() body: SendNotificationDto,
    @Req() req: Request,
  ) {
    return this.integrationsService.sendNotification(
      body,
      this.resolveBaseUrl(req),
    );
  }

  @Post('twilio/status')
  twilioStatusCallback(@Body() body: Record<string, string | undefined>) {
    return this.integrationsService.handleTwilioStatusCallback(body);
  }

  @Get('shift-confirmations/:token')
  async confirmShiftAssignment(
    @Param('token') token: string,
    @Res() res: Response,
  ) {
    const result = await this.integrationsService.confirmShiftAssignment(token);
    return res
      .status(result.httpStatus)
      .type('html')
      .send(this.integrationsService.renderConfirmationHtml(result));
  }

  @Get('debug/push-tokens/:email')
  async debugPushTokens(@Param('email') email: string) {
    const worker = await this.workersRepo.findOne({
      where: { email: email.trim().toLowerCase() },
    });
    if (!worker) {
      return { error: 'Worker not found', email };
    }
    const tokens = worker.fcmTokens || [];
    return {
      workerId: worker.id,
      email: worker.email,
      totalTokens: tokens.length,
      tokens: tokens.map((t) => ({
        value: t,
        isExpoPushToken: Expo.isExpoPushToken(t),
        format: t.startsWith('ExponentPushToken[')
          ? 'expo'
          : t.length === 152 && /^[a-zA-Z0-9_-]+$/.test(t)
            ? 'old-apns-hex'
            : t.length > 100
              ? 'fcm-token'
              : 'unknown',
      })),
    };
  }

  @Post('debug/test-push')
  async debugTestPush(@Body() body: { token: string; title?: string; body?: string }) {
    if (!body?.token) {
      return { error: 'token is required' };
    }
    const expo = new Expo();
    const messages = [
      {
        to: body.token,
        sound: 'default' as const,
        title: body.title || 'Test push from backend',
        body: body.body || 'If you see this, Expo Push is working!',
        data: { test: 'true' },
      },
    ];
    const tickets = await expo.sendPushNotificationsAsync(messages);
    return { tickets };
  }
}
