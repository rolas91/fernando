import { PartialType } from '@nestjs/swagger';
import { CreateAvailabilityRequestDto } from './create-availability-request.dto';

export class UpdateAvailabilityRequestDto extends PartialType(
  CreateAvailabilityRequestDto,
) {}
