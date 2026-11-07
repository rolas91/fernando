import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  id: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsBoolean()
  read?: boolean;

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsString()
  workerId?: string;

  @IsOptional()
  @IsString()
  workOrderId?: string;

  @IsOptional()
  @IsString()
  shiftId?: string;

  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsString()
  deliveryStatus?: string;

  @IsOptional()
  @IsString()
  providerMessageId?: string;
}
