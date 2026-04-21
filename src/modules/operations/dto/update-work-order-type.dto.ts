import { PartialType } from '@nestjs/swagger';
import { CreateWorkOrderTypeDto } from './create-work-order-type.dto';

export class UpdateWorkOrderTypeDto extends PartialType(CreateWorkOrderTypeDto) {}
