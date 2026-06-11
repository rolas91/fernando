import { IsArray, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateCompanySettingsDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  logoIcon?: string;

  @IsOptional()
  @IsObject()
  overtimeRules?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  workerTypes?: string[];

  @IsOptional()
  @IsArray()
  equipmentTypes?: string[];

  @IsOptional()
  @IsArray()
  materialTypes?: string[];

  @IsOptional()
  @IsArray()
  jobStatuses?: string[];

  @IsOptional()
  @IsObject()
  assignmentAutoStatus?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  minimumRestHours?: number;
}
