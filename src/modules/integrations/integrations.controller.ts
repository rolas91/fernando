import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';

type GeocodeInput = {
  id: string;
  name: string;
  location: string;
  city: string;
  status: string;
  clientName: string;
};

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Post('geocode-jobs')
  geocodeJobs(@Body() body: { locations?: GeocodeInput[] }) {
    return this.integrationsService.geocodeJobs(body.locations || []);
  }

  @Post('send-notification')
  sendNotification(
    @Body()
    body: {
      action?: 'send_sms' | 'send_email' | 'send_in_app';
      phone?: string;
      message?: string;
      workerName?: string;
      email?: string;
    },
  ) {
    return this.integrationsService.sendNotification(body);
  }
}
