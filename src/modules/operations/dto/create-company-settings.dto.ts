import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

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
  jobStatuses?: string[];
}
