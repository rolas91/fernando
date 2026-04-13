import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealtimeModule } from '../realtime/realtime.module';
import { ActivityFeedItem } from '../../entities/activity-feed.entity';
import { AvailabilityRequest } from '../../entities/availability-request.entity';
import { Client } from '../../entities/client.entity';
import { CompanySettings } from '../../entities/company-settings.entity';
import { Equipment } from '../../entities/equipment.entity';
import { FormSubmission } from '../../entities/form-submission.entity';
import { FormTemplate } from '../../entities/form-template.entity';
import { Incident } from '../../entities/incident.entity';
import { Notification } from '../../entities/notification.entity';
import { Project } from '../../entities/project.entity';
import { Timesheet } from '../../entities/timesheet.entity';
import { WorkOrder } from '../../entities/work-order.entity';
import { Worker } from '../../entities/worker.entity';
import { ActivityFeedController } from './controllers/activity-feed.controller';
import { AvailabilityRequestsController } from './controllers/availability-requests.controller';
import { ClientsController } from './controllers/clients.controller';
import { CompanySettingsController } from './controllers/company-settings.controller';
import { EquipmentController } from './controllers/equipment.controller';
import { FormSubmissionsController } from './controllers/form-submissions.controller';
import { FormTemplatesController } from './controllers/form-templates.controller';
import { IncidentsController } from './controllers/incidents.controller';
import { NotificationsController } from './controllers/notifications.controller';
import { ProjectsController } from './controllers/projects.controller';
import { TimesheetsController } from './controllers/timesheets.controller';
import { WorkOrdersController } from './controllers/work-orders.controller';
import { WorkersController } from './controllers/workers.controller';
import { ActivityFeedService } from './services/activity-feed.service';
import { AvailabilityRequestsService } from './services/availability-requests.service';
import { ClientsService } from './services/clients.service';
import { CompanySettingsService } from './services/company-settings.service';
import { EquipmentService } from './services/equipment.service';
import { FormSubmissionsService } from './services/form-submissions.service';
import { FormTemplatesService } from './services/form-templates.service';
import { IncidentsService } from './services/incidents.service';
import { NotificationsService } from './services/notifications.service';
import { ProjectsService } from './services/projects.service';
import { TimesheetsService } from './services/timesheets.service';
import { WorkOrdersService } from './services/work-orders.service';
import { WorkersService } from './services/workers.service';
import { OperationsAuthGuard } from './operations-auth.guard';
import { DrAuthModule } from '../dr-auth/dr-auth.module';

@Module({
  imports: [
    DrAuthModule,
    RealtimeModule,
    TypeOrmModule.forFeature([
      Worker,
      Project,
      WorkOrder,
      Client,
      Equipment,
      Timesheet,
      FormTemplate,
      FormSubmission,
      Incident,
      Notification,
      ActivityFeedItem,
      AvailabilityRequest,
      CompanySettings,
    ]),
  ],
  controllers: [
    WorkersController,
    ProjectsController,
    WorkOrdersController,
    ClientsController,
    EquipmentController,
    TimesheetsController,
    FormTemplatesController,
    FormSubmissionsController,
    IncidentsController,
    NotificationsController,
    ActivityFeedController,
    AvailabilityRequestsController,
    CompanySettingsController,
  ],
  providers: [
    WorkersService,
    ProjectsService,
    WorkOrdersService,
    ClientsService,
    EquipmentService,
    TimesheetsService,
    FormTemplatesService,
    FormSubmissionsService,
    IncidentsService,
    NotificationsService,
    ActivityFeedService,
    AvailabilityRequestsService,
    CompanySettingsService,
    OperationsAuthGuard,
  ],
  exports: [
    WorkersService,
    ProjectsService,
    WorkOrdersService,
    ClientsService,
    EquipmentService,
    TimesheetsService,
    FormTemplatesService,
    FormSubmissionsService,
    IncidentsService,
    NotificationsService,
    ActivityFeedService,
    AvailabilityRequestsService,
    CompanySettingsService,
  ],
})
export class OperationsModule {}
