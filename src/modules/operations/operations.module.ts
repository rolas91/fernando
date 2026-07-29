import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityFeedItem } from '../../entities/activity-feed.entity';
import { AvailabilityRequest } from '../../entities/availability-request.entity';
import { Certification } from '../../entities/certification.entity';
import { Client } from '../../entities/client.entity';
import { CommercialCatalogItem } from '../../entities/commercial-catalog-item.entity';
import { CommercialInvoice } from '../../entities/commercial-invoice.entity';
import { CommercialWorkOrder } from '../../entities/commercial-work-order.entity';
import { CompanySettings } from '../../entities/company-settings.entity';
import { Equipment } from '../../entities/equipment.entity';
import { FormSubmission } from '../../entities/form-submission.entity';
import { FormTemplate } from '../../entities/form-template.entity';
import { Incident } from '../../entities/incident.entity';
import { Material } from '../../entities/material.entity';
import { Notification } from '../../entities/notification.entity';
import { Project } from '../../entities/project.entity';
import { ProjectType } from '../../entities/project-type.entity';
import { Shift } from '../../entities/shift.entity';
import { ShiftAssignmentConfirmation } from '../../entities/shift-assignment-confirmation.entity';
import { ShiftChatMessage } from '../../entities/shift-chat-message.entity';
import { Skill } from '../../entities/skill.entity';
import { StatusCatalog } from '../../entities/status-catalog.entity';
import { Timesheet } from '../../entities/timesheet.entity';
import { WorkOrder } from '../../entities/work-order.entity';
import { WorkOrderShift } from '../../entities/work-order-shift.entity';
import { WorkOrderShiftRole } from '../../entities/work-order-shift-role.entity';
import { WorkOrderShiftRoleWorker } from '../../entities/work-order-shift-role-worker.entity';
import { WorkOrderSequence } from '../../entities/work-order-sequence.entity';
import { WorkOrderType } from '../../entities/work-order-type.entity';
import { Worker } from '../../entities/worker.entity';
import { WorkerCertification } from '../../entities/worker-certification.entity';
import { WorkerRole } from '../../entities/worker-role.entity';
import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ActivityFeedController } from './controllers/activity-feed.controller';
import { AvailabilityRequestsController } from './controllers/availability-requests.controller';
import { CertificationsController } from './controllers/certifications.controller';
import { ClientsController } from './controllers/clients.controller';
import { CommercialCatalogItemsController } from './controllers/commercial-catalog-items.controller';
import { CommercialWorkOrdersController } from './controllers/commercial-work-orders.controller';
import { CompanySettingsController } from './controllers/company-settings.controller';
import { EquipmentController } from './controllers/equipment.controller';
import { FormContractController } from './controllers/form-contract.controller';
import { FormSubmissionsController } from './controllers/form-submissions.controller';
import { FormTemplatesController } from './controllers/form-templates.controller';
import { IncidentsController } from './controllers/incidents.controller';
import { MaterialsController } from './controllers/materials.controller';
import { NotificationsController } from './controllers/notifications.controller';
import { NumberingController } from './controllers/numbering.controller';
import { ProjectsController } from './controllers/projects.controller';
import { ProjectTypesController } from './controllers/project-types.controller';
import { ShiftsController } from './controllers/shifts.controller';
import { ShiftStatusController } from './controllers/shift-status.controller';
import { ShiftChatController } from './controllers/shift-chat.controller';
import { SkillsController } from './controllers/skills.controller';
import { StatusCatalogController } from './controllers/status-catalog.controller';
import { TimesheetsController } from './controllers/timesheets.controller';
import { WorkOrderTypesController } from './controllers/work-order-types.controller';
import { WorkOrdersController } from './controllers/work-orders.controller';
import { WorkersController } from './controllers/workers.controller';
import { WorkerRolesController } from './controllers/worker-roles.controller';
import { ActivityFeedService } from './services/activity-feed.service';
import { AvailabilityRequestsService } from './services/availability-requests.service';
import { CertificationsService } from './services/certifications.service';
import { ClientsService } from './services/clients.service';
import { CommercialCatalogItemsService } from './services/commercial-catalog-items.service';
import { CommercialWorkOrdersService } from './services/commercial-work-orders.service';
import { CompanySettingsService } from './services/company-settings.service';
import { EquipmentService } from './services/equipment.service';
import { FormContextResolutionService } from './services/form-context-resolution.service';
import { FormSubmissionsService } from './services/form-submissions.service';
import { FormTemplatesService } from './services/form-templates.service';
import { IncidentsService } from './services/incidents.service';
import { MaterialsService } from './services/materials.service';
import { NotificationsService } from './services/notifications.service';
import { ProjectsService } from './services/projects.service';
import { ProjectTypesService } from './services/project-types.service';
import { ShiftsQueryService } from './services/shifts-query.service';
import { ShiftsService } from './services/shifts.service';
import { ShiftStatusService } from './services/shift-status.service';
import { ShiftChatService } from './services/shift-chat.service';
import { SkillsService } from './services/skills.service';
import { StatusCatalogService } from './services/status-catalog.service';
import { TimesheetsService } from './services/timesheets.service';
import { WorkOrderShiftsWriteService } from './services/work-order-shifts-write.service';
import { NumberingService } from './services/numbering.service';
import { WorkOrderTypesService } from './services/work-order-types.service';
import { WorkOrdersService } from './services/work-orders.service';
import { WorkersService } from './services/workers.service';
import { WorkerRolesService } from './services/worker-roles.service';
import { OperationsAuthGuard } from './operations-auth.guard';
import { SpacesStorageService } from './services/spaces-storage.service';
import { ShiftWorkOrderAccessService } from './services/shift-work-order-access.service';
import { ShiftChatGateway } from './gateways/shift-chat.gateway';
import { CatalogImportModule } from './import/catalog-import.module';
import { PagedListsController } from './controllers/paged-lists.controller';

@Module({
  imports: [
    AccessModule,
    AuthModule,
    UsersModule,
    RealtimeModule,
    IntegrationsModule,
    CatalogImportModule,
    TypeOrmModule.forFeature([
      Worker,
      WorkerRole,
      CommercialCatalogItem,
      CommercialInvoice,
      CommercialWorkOrder,
      Skill,
      WorkerCertification,
      Certification,
      Shift,
      ShiftAssignmentConfirmation,
      ShiftChatMessage,
      StatusCatalog,
      Project,
      ProjectType,
      WorkOrder,
      WorkOrderType,
      Client,
      Equipment,
      Material,
      Timesheet,
      FormTemplate,
      FormSubmission,
      Incident,
      Notification,
      ActivityFeedItem,
      AvailabilityRequest,
      CompanySettings,
      WorkOrderShift,
      WorkOrderShiftRole,
      WorkOrderShiftRoleWorker,
      WorkOrderSequence,
    ]),
  ],
  controllers: [
    PagedListsController,
    WorkersController,
    WorkerRolesController,
    ShiftsController,
    ShiftStatusController,
    ShiftChatController,
    SkillsController,
    StatusCatalogController,
    ProjectsController,
    ProjectTypesController,
    WorkOrdersController,
    WorkOrderTypesController,
    ClientsController,
    CommercialCatalogItemsController,
    CommercialWorkOrdersController,
    EquipmentController,
    MaterialsController,
    TimesheetsController,
    FormTemplatesController,
    FormSubmissionsController,
    FormContractController,
    IncidentsController,
    NotificationsController,
    ActivityFeedController,
    AvailabilityRequestsController,
    CertificationsController,
    CompanySettingsController,
    NumberingController,
  ],
  providers: [
    WorkersService,
    WorkerRolesService,
    CertificationsService,
    ShiftsService,
    ShiftStatusService,
    ShiftChatService,
    SkillsService,
    StatusCatalogService,
    ProjectsService,
    ProjectTypesService,
    WorkOrdersService,
    WorkOrderTypesService,
    CommercialCatalogItemsService,
    CommercialWorkOrdersService,
    ClientsService,
    EquipmentService,
    MaterialsService,
    TimesheetsService,
    FormTemplatesService,
    FormSubmissionsService,
    FormContextResolutionService,
    IncidentsService,
    NotificationsService,
    ActivityFeedService,
    AvailabilityRequestsService,
    CompanySettingsService,
    SpacesStorageService,
    ShiftChatGateway,
    OperationsAuthGuard,
    ShiftsQueryService,
    WorkOrderShiftsWriteService,
    ShiftWorkOrderAccessService,
    NumberingService,
  ],
  exports: [
    WorkersService,
    WorkerRolesService,
    CertificationsService,
    ShiftsService,
    ShiftStatusService,
    ShiftChatService,
    SkillsService,
    StatusCatalogService,
    ProjectsService,
    ProjectTypesService,
    WorkOrdersService,
    WorkOrderTypesService,
    CommercialCatalogItemsService,
    CommercialWorkOrdersService,
    ClientsService,
    EquipmentService,
    MaterialsService,
    TimesheetsService,
    FormTemplatesService,
    FormSubmissionsService,
    IncidentsService,
    NotificationsService,
    ActivityFeedService,
    AvailabilityRequestsService,
    CompanySettingsService,
    ShiftsQueryService,
    WorkOrderShiftsWriteService,
    ShiftWorkOrderAccessService,
  ],
})
export class OperationsModule {}
