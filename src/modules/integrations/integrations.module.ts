import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkOrder } from '../../entities/work-order.entity';
import { Worker } from '../../entities/worker.entity';
import { Notification } from '../../entities/notification.entity';
import { ShiftAssignmentConfirmation } from '../../entities/shift-assignment-confirmation.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { ShiftsQueryService } from '../operations/services/shifts-query.service';
import { WorkOrderShiftsWriteService } from '../operations/services/work-order-shifts-write.service';
import { WorkOrderShift } from '../../entities/work-order-shift.entity';
import { WorkOrderShiftRole } from '../../entities/work-order-shift-role.entity';
import { WorkOrderShiftRoleWorker } from '../../entities/work-order-shift-role-worker.entity';

@Module({
  imports: [
    RealtimeModule,
    TypeOrmModule.forFeature([
      WorkOrder,
      Worker,
      Notification,
      ShiftAssignmentConfirmation,
      WorkOrderShift,
      WorkOrderShiftRole,
      WorkOrderShiftRoleWorker,
    ]),
  ],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, ShiftsQueryService, WorkOrderShiftsWriteService],
  exports: [IntegrationsService, ShiftsQueryService, WorkOrderShiftsWriteService],
})
export class IntegrationsModule {}
