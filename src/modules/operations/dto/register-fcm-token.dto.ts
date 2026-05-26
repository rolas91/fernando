import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterFcmTokenDto {
  @IsString()
  @MaxLength(4096)
  token: string;

  @IsOptional()
  @IsString()
  @IsIn(['android', 'ios', 'web', 'unknown'])
  platform?: 'android' | 'ios' | 'web' | 'unknown';
}
