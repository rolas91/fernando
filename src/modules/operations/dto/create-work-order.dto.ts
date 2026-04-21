import { IsArray, IsOptional, IsString } from 'class-validator';

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
  notes?: string;

  @IsOptional()
  @IsArray()
  attachments?: string[];
}
