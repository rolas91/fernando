import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Certification } from '../../../entities/certification.entity';
import { Client } from '../../../entities/client.entity';
import { CommercialCatalogItem } from '../../../entities/commercial-catalog-item.entity';
import { Equipment } from '../../../entities/equipment.entity';
import { Material } from '../../../entities/material.entity';
import { ProjectType } from '../../../entities/project-type.entity';
import { Skill } from '../../../entities/skill.entity';
import { StatusCatalog } from '../../../entities/status-catalog.entity';
import { WorkOrderType } from '../../../entities/work-order-type.entity';
import { Worker } from '../../../entities/worker.entity';
import { WorkerCertification } from '../../../entities/worker-certification.entity';
import { WorkerRole } from '../../../entities/worker-role.entity';
import { RealtimeModule } from '../../realtime/realtime.module';
import { CatalogImportController } from './catalog-import.controller';
import { CatalogImportService } from './catalog-import.service';

@Module({
  imports: [
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
    ]),
  ],
  controllers: [CatalogImportController],
  providers: [CatalogImportService],
  exports: [CatalogImportService],
})
export class CatalogImportModule {}
