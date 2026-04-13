import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateFormSubmissionDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  workerId?: string;

  @IsOptional()
  @IsString()
  submittedAt?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsString()
  status: string;
}
