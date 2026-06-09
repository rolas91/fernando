import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCommercialCatalogItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  sku: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsNumber()
  dailyRate: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
