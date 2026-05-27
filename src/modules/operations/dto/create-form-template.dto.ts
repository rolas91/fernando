import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateFormTemplateDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsString()
  contractVersion?: string;

  @IsOptional()
  @IsArray()
  fields?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  assignedProjects?: string[];

  @IsOptional()
  @IsArray()
  assignedRoles?: string[];
}
