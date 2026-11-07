import { IsOptional, IsString } from 'class-validator';

export class CreateEquipmentDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  identifier?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  lastMaintenance?: string;

  @IsOptional()
  @IsString()
  nextMaintenance?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
