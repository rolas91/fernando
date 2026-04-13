import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateIncidentDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  reportedBy?: string;

  @IsString()
  date: string;

  @IsString()
  severity: string;

  @IsString()
  status: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsArray()
  photos?: string[];

  @IsOptional()
  @IsString()
  actions?: string;
}
