import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateTimesheetDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  workerId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  workOrderId?: string;

  @IsOptional()
  @IsString()
  shiftId?: string;

  @IsString()
  date: string;

  @IsOptional()
  @IsString()
  clockIn?: string;

  @IsOptional()
  @IsString()
  clockOut?: string;

  @IsOptional()
  @IsInt()
  breakMinutes?: number;

  @IsOptional()
  @IsNumber()
  regularHours?: number;

  @IsOptional()
  @IsNumber()
  overtimeHours?: number;

  @IsOptional()
  @IsNumber()
  doubleTimeHours?: number;

  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  approvedBy?: string;

  @IsOptional()
  @IsString()
  rejectedReason?: string;

  @IsOptional()
  lunchTaken?: boolean;

  @IsOptional()
  @IsString()
  employeeNote?: string;

  @IsOptional()
  @IsString()
  signature?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
