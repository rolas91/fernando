import { IsArray, IsNumber, IsOptional, IsString, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWorkOrderDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  workOrderTypeId?: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  orderNumber?: string;

  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  shifts?: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  requesterName?: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhoneNumber?: string;

  @IsOptional()
  @IsString()
  assignmentAddress?: string;

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

  @IsOptional()
  @IsString()
  assignmentCity?: string;

  @IsOptional()
  @IsString()
  assignmentState?: string;

  @IsOptional()
  @IsString()
  assignmentZipCode?: string;

  @IsOptional()
  @IsString()
  assignmentCountry?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  dispatchNote?: string;

  @IsOptional()
  @IsArray()
  fileUploads?: string[];

  @IsOptional()
  @IsArray()
  attachments?: string[];
}
