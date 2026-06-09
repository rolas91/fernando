import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class OffRentItemDto {
  @IsString()
  itemId: string;

  @IsNumber()
  offRentQty: number;

  @IsOptional()
  @IsNumber()
  lossQty?: number;
}

export class ProcessOffRentDto {
  @IsString()
  offRentDate: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OffRentItemDto)
  items: OffRentItemDto[];
}
