import { IsArray, IsOptional, IsString } from 'class-validator';

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
  @IsArray()
  fields?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  assignedProjects?: string[];

  @IsOptional()
  @IsArray()
  assignedRoles?: string[];
}
