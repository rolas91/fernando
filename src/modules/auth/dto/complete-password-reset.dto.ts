import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CompletePasswordResetDto {
  @ApiProperty({ description: 'Single-use token received by email' })
  @IsString()
  @MinLength(32)
  token: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
