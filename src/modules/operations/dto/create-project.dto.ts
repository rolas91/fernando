import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, ValidateIf } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  projectTypeId?: string;

  @IsOptional()
  @IsString()
  projectManager?: string;

  @IsOptional()
  @IsString()
  projectManagerEmail?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  latitude?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  longitude?: number | null;

  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  startDate?: string | null;

  @IsOptional()
  @IsString()
  endDate?: string | null;

  @IsOptional()
  @IsString()
  workOrderNumber?: string;

  @IsOptional()
  @IsString()
  purchaseOrder?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
