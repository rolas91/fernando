import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'admin', minLength: 2 })
  @IsString()
  @MinLength(2)
  key: string;

  @ApiProperty({ example: 'Admin', minLength: 2 })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: 'Administrador del sistema' })
  @IsOptional()
  @IsString()
  description?: string;
}
