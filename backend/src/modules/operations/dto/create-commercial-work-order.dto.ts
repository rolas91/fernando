import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CommercialWorkOrderItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  catalogItemId?: string;

  @IsOptional()
  @IsString()
  catalogSource?: 'commercial' | 'material' | 'equipment';

  @IsString()
  sku: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsNumber()
  qty?: number;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsNumber()
  dailyRate?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  onRentQty?: number;

  @IsOptional()
  @IsString()
  onRentDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateCommercialWorkOrderDto {
  @IsIn(['sale', 'on_rent'])
  type: 'sale' | 'on_rent';

  @IsOptional()
  @IsString()
  workOrderNumber?: string;

  @IsOptional()
  @IsString()
  status?: 'draft' | 'sale_completed' | 'on_rent' | 'closed';

  @IsOptional()
  @IsString()
  jobNumber?: string;

  @IsString()
  jobName: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsString()
  customerName: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  customerOrderNumber?: string;

  @IsOptional()
  @IsString()
  descriptionOfWork?: string;

  @IsOptional()
  @IsString()
  workDate?: string;

  @IsOptional()
  @IsString()
  onRentDate?: string;

  @IsOptional()
  @IsString()
  previousBillingDate?: string;

  @IsOptional()
  @IsString()
  nextInvoiceDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommercialWorkOrderItemDto)
  items: CommercialWorkOrderItemDto[];
}
