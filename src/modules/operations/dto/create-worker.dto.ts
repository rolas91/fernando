import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateWorkerDto {
  @IsString()
  id: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  type: string;

  @IsString()
  role: string;

  @IsString()
  status: string;

  @IsOptional()
  @IsArray()
  certifications?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  skills?: string[];

  @IsOptional()
  @IsString()
  hireDate?: string;

  @IsOptional()
  @IsNumber()
  hourlyRate?: number;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
