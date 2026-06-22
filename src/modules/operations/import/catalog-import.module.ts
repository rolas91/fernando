import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Certification } from '../../../entities/certification.entity';
import { Client } from '../../../entities/client.entity';
import { CommercialCatalogItem } from '../../../entities/commercial-catalog-item.entity';
import { Equipment } from '../../../entities/equipment.entity';
import { FormTemplate } from '../../../entities/form-template.entity';
import { Material } from '../../../entities/material.entity';
import { ProjectType } from '../../../entities/project-type.entity';
import { Skill } from '../../../entities/skill.entity';
import { StatusCatalog } from '../../../entities/status-catalog.entity';
import { WorkOrderType } from '../../../entities/work-order-type.entity';
import { Worker } from '../../../entities/worker.entity';
import { WorkerCertification } from '../../../entities/worker-certification.entity';
import { WorkerRole } from '../../../entities/worker-role.entity';
import { AccessModule } from '../../access/access.module';
import { AuthModule } from '../../auth/auth.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { CatalogImportController } from './catalog-import.controller';
import { CatalogImportService } from './catalog-import.service';
import { OperationsAuthGuard } from '../operations-auth.guard';

@Module({
  imports: [
    AccessModule,
    AuthModule,
    RealtimeModule,
    TypeOrmModule.forFeature([
      Skill,
      WorkerRole,
      ProjectType,
      WorkOrderType,
      Certification,
      Equipment,
      Material,
      StatusCatalog,
      CommercialCatalogItem,
      Client,
      Worker,
      WorkerCertification,
      FormTemplate,
    ]),
  ],
  controllers: [CatalogImportController],
  providers: [CatalogImportService, OperationsAuthGuard],
  exports: [CatalogImportService],
})
export class CatalogImportModule {}
