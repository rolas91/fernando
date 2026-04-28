import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { GeocodeJobsDto } from './dto/geocode-jobs.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { IntegrationsService } from './integrations.service';

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

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
}
