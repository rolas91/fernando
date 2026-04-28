import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkOrder } from '../../entities/work-order.entity';
import { Worker } from '../../entities/worker.entity';
import { ShiftAssignmentConfirmation } from '../../entities/shift-assignment-confirmation.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [
    RealtimeModule,
    TypeOrmModule.forFeature([
      WorkOrder,
      Worker,
      ShiftAssignmentConfirmation,
    ]),
  ],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
})
export class IntegrationsModule {}
