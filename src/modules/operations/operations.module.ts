import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { Shift } from '../../entities/shift.entity';
import { ShiftAssignmentConfirmation } from '../../entities/shift-assignment-confirmation.entity';
import { StatusCatalog } from '../../entities/status-catalog.entity';
import { Timesheet } from '../../entities/timesheet.entity';
import { WorkOrder } from '../../entities/work-order.entity';
import { WorkOrderType } from '../../entities/work-order-type.entity';
import { Worker } from '../../entities/worker.entity';
import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ActivityFeedController } from './controllers/activity-feed.controller';
import { AvailabilityRequestsController } from './controllers/availability-requests.controller';
import { ClientsController } from './controllers/clients.controller';
import { CompanySettingsController } from './controllers/company-settings.controller';
import { EquipmentController } from './controllers/equipment.controller';
import { FormContractController } from './controllers/form-contract.controller';
import { FormSubmissionsController } from './controllers/form-submissions.controller';
import { FormTemplatesController } from './controllers/form-templates.controller';
import { IncidentsController } from './controllers/incidents.controller';
import { NotificationsController } from './controllers/notifications.controller';
import { ProjectsController } from './controllers/projects.controller';
import { ShiftsController } from './controllers/shifts.controller';
import { StatusCatalogController } from './controllers/status-catalog.controller';
import { TimesheetsController } from './controllers/timesheets.controller';
import { WorkOrderTypesController } from './controllers/work-order-types.controller';
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
import { ShiftsService } from './services/shifts.service';
import { StatusCatalogService } from './services/status-catalog.service';
import { TimesheetsService } from './services/timesheets.service';
import { WorkOrderTypesService } from './services/work-order-types.service';
import { WorkOrdersService } from './services/work-orders.service';
import { WorkersService } from './services/workers.service';
import { OperationsAuthGuard } from './operations-auth.guard';

@Module({
  imports: [
    AccessModule,
    AuthModule,
    RealtimeModule,
    TypeOrmModule.forFeature([
      Worker,
      Shift,
      ShiftAssignmentConfirmation,
      StatusCatalog,
      Project,
      WorkOrder,
      WorkOrderType,
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
    ShiftsController,
    StatusCatalogController,
    ProjectsController,
    WorkOrdersController,
    WorkOrderTypesController,
    ClientsController,
    EquipmentController,
    TimesheetsController,
    FormTemplatesController,
    FormSubmissionsController,
    FormContractController,
    IncidentsController,
    NotificationsController,
    ActivityFeedController,
    AvailabilityRequestsController,
    CompanySettingsController,
  ],
  providers: [
    WorkersService,
    ShiftsService,
    StatusCatalogService,
    ProjectsService,
    WorkOrdersService,
    WorkOrderTypesService,
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
    ShiftsService,
    StatusCatalogService,
    ProjectsService,
    WorkOrdersService,
    WorkOrderTypesService,
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
