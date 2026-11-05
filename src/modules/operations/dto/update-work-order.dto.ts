import { PartialType } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { CreateWorkOrderDto } from './create-work-order.dto';

export class UpdateWorkOrderDto extends PartialType(CreateWorkOrderDto) {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  changedShiftIds?: string[];
}
