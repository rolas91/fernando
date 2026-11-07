import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class GrantPermissionDto {
  @ApiProperty({ example: 'access.read', minLength: 3 })
  @IsString()
  @MinLength(3)
  permissionKey: string;
}
