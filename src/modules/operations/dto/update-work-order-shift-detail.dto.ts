import { IsObject } from 'class-validator';

export class UpdateWorkOrderShiftDetailDto {
  @IsObject()
  shift: Record<string, unknown>;
}
