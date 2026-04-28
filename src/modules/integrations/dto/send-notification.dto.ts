import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ShiftConfirmationPayloadDto {
  @ApiPropertyOptional({ example: 'wo_123' })
  @IsOptional()
  @IsString()
  workOrderId?: string;

  @ApiPropertyOptional({ example: 'shift_123' })
  @IsOptional()
  @IsString()
  shiftId?: string;

  @ApiPropertyOptional({ example: 'role_123' })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({ example: 'worker_123' })
  @IsOptional()
  @IsString()
  workerId?: string;

  @ApiPropertyOptional({ example: 'Road Rehabilitation - Downtown Corridor' })
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional({ example: '2026-04-28' })
  @IsOptional()
  @IsString()
  shiftDate?: string;

  @ApiPropertyOptional({ example: '7:00a - 4:00p' })
  @IsOptional()
  @IsString()
  shiftTime?: string;

  @ApiPropertyOptional({ example: 'San Francisco' })
  @IsOptional()
  @IsString()
  location?: string;
}

export class SendNotificationDto {
  @ApiProperty({
    enum: ['send_sms', 'send_email', 'send_in_app'],
    example: 'send_sms',
  })
  @IsOptional()
  @IsString()
  @IsIn(['send_sms', 'send_email', 'send_in_app'])
  action?: 'send_sms' | 'send_email' | 'send_in_app';

  @ApiPropertyOptional({ example: '+15025550100' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'Reply to confirm your shift assignment.',
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ example: 'Gabriela Martinez' })
  @IsOptional()
  @IsString()
  workerName?: string;

  @ApiPropertyOptional({ example: 'worker@example.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ type: ShiftConfirmationPayloadDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ShiftConfirmationPayloadDto)
  confirmation?: ShiftConfirmationPayloadDto;
}
