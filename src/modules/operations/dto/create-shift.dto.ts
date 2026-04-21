import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateShiftDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsNumber()
  durationHours?: number;

  @IsString()
  status: string;
}
