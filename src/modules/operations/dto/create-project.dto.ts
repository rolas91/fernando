import { IsOptional, IsString } from 'class-validator';

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

  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

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
