import { PartialType } from '@nestjs/swagger';
import { CreateCommercialCatalogItemDto } from './create-commercial-catalog-item.dto';

export class UpdateCommercialCatalogItemDto extends PartialType(
  CreateCommercialCatalogItemDto,
) {}
