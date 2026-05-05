import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class WorkerCertificationAssignmentDto {
  @IsString()
  certificationId: string;

  @IsOptional()
  @IsString()
  expirationDate?: string;
}

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

  @IsOptional()
  @IsString()
  driverLicense?: string;

  @IsOptional()
  @IsString()
  primaryAddress?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsString()
  type: string;

  @IsString()
  role: string;

  @IsString()
  status: string;

  @IsOptional()
  @IsArray()
  certificationIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerCertificationAssignmentDto)
  certificationAssignments?: WorkerCertificationAssignmentDto[];

  @IsOptional()
  @IsArray()
  skillIds?: string[];

  @IsOptional()
  @IsArray()
  skills?: string[];

  @IsOptional()
  @IsArray()
  fileUploads?: string[];

  @IsOptional()
  @IsString()
  hireDate?: string;

  @IsOptional()
  @Type(() => Number)
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
