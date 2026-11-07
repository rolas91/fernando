import { IsOptional, IsString } from 'class-validator';

export class CreateAvailabilityRequestDto {
  @IsString()
  id: string;

  @IsString()
  workerId: string;

  @IsString()
  date: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  reviewedBy?: string;

  @IsOptional()
  @IsString()
  reviewedAt?: string;
}
