import { Type } from 'class-transformer';
import { IsNumberString, IsOptional, IsString, Matches } from 'class-validator';

export class CreateMaterialDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  identifier?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @Type(() => String)
  @IsNumberString()
  @Matches(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, {
    message: 'price must be greater than or equal to zero',
  })
  price?: string;

  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  lastMaintenance?: string;

  @IsOptional()
  @IsString()
  nextMaintenance?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
