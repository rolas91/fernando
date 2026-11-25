import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, IsIn } from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({ enum: ['web', 'mobile'] })
  @IsOptional()
  @IsIn(['web', 'mobile'])
  platform?: 'web' | 'mobile';

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'ChangeMe123!' })
  @IsString()
  password: string;
}
