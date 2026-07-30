import { IsArray, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

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
  workOrderTypeOptions?: string[];

  @IsOptional()
  @IsArray()
  jobStatuses?: string[];

  @IsOptional()
  @IsNumber()
  minimumRestHours?: number;

  @IsOptional()
  @IsString()
  workOrderNumberPrefix?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(10)
  workOrderNumberPadding?: number;

  @IsOptional()
  @IsIn(['never', 'yearly', 'monthly'])
  workOrderNumberReset?: 'never' | 'yearly' | 'monthly';

  @IsOptional()
  @IsString()
  workOrderNumberTemplate?: string;
}
