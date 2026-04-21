import { PartialType } from '@nestjs/swagger';
import { CreateStatusCatalogDto } from './create-status-catalog.dto';

export class UpdateStatusCatalogDto extends PartialType(CreateStatusCatalogDto) {}
