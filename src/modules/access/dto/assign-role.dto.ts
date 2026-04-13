import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({ example: 'admin', minLength: 2 })
  @IsString()
  @MinLength(2)
  roleKey: string;
}
