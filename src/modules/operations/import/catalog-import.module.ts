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
import { WorkerRole } from '../../../entities/worker-role.entity';
import { CertificationsService } from '../services/certifications.service';
import { ClientsService } from '../services/clients.service';
import { CommercialCatalogItemsService } from '../services/commercial-catalog-items.service';
import { EquipmentService } from '../services/equipment.service';
import { MaterialsService } from '../services/materials.service';
import { ProjectTypesService } from '../services/project-types.service';
import { SkillsService } from '../services/skills.service';
import { StatusCatalogService } from '../services/status-catalog.service';
import { WorkOrderTypesService } from '../services/work-order-types.service';
import { WorkerRolesService } from '../services/worker-roles.service';
import { WorkersService } from '../services/workers.service';
import { CatalogImportController } from './catalog-import.controller';
import { CatalogImportService } from './catalog-import.service';

@Module({
  imports: [
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
    ]),
  ],
  controllers: [CatalogImportController],
  providers: [
    CatalogImportService,
    SkillsService,
    WorkerRolesService,
    ProjectTypesService,
    WorkOrderTypesService,
    CertificationsService,
    EquipmentService,
    MaterialsService,
    StatusCatalogService,
    CommercialCatalogItemsService,
    ClientsService,
    WorkersService,
  ],
  exports: [CatalogImportService],
})
export class CatalogImportModule {}
