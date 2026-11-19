import { IsString, MaxLength } from 'class-validator';

export class UnregisterFcmTokenDto {
  @IsString()
  @MaxLength(4096)
  token: string;
}
