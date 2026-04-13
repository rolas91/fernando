import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  id: string;

  @IsString()
  type: string;

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
}
