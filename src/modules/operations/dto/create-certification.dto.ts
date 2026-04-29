import { IsOptional, IsString } from 'class-validator';

export class CreateCertificationDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  documentUrl?: string;

  @IsString()
  status: string;
}
