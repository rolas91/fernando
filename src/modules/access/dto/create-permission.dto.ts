import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({ example: 'access.manage', minLength: 3 })
  @IsString()
  @MinLength(3)
  key: string;

  @ApiPropertyOptional({ example: 'Administrar roles/permisos' })
  @IsOptional()
  @IsString()
  description?: string;
}
