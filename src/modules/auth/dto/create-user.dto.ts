import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'new.user@drtrafficcontrol.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'NewPassword123!', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: 'New' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'User' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: '+15025550100' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'viewer', enum: ['admin', 'manager', 'scheduler', 'viewer'] })
  @IsString()
  @IsIn(['admin', 'manager', 'scheduler', 'viewer'])
  role: 'admin' | 'manager' | 'scheduler' | 'viewer';
}
