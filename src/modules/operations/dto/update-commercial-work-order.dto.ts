import { PartialType } from '@nestjs/swagger';
import { CreateCommercialWorkOrderDto } from './create-commercial-work-order.dto';

export class UpdateCommercialWorkOrderDto extends PartialType(
  CreateCommercialWorkOrderDto,
) {}
