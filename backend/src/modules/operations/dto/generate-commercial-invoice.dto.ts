import { IsArray, IsOptional, IsString } from 'class-validator';

export class GenerateCommercialInvoiceDto {
  @IsString()
  billingDate: string;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsOptional()
  @IsArray()
  itemIds?: string[];
}
