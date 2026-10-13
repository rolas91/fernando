import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class BulkShiftRoleDto {
  @IsString()
  roleName: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsNumber()
  requiredCount: number;

  @IsOptional()
  @IsArray()
  requiredCertificationIds?: string[];

  @IsOptional()
  @IsArray()
  requiredSkillIds?: string[];

  @IsOptional()
  @IsArray()
  assignedWorkers?: string[];
}

export class BulkCreateShiftsDto {
  @IsString()
  shiftName: string;

                                                                        
  @IsString()
  baseDate: string;

                                                              
  @IsArray()
  @IsString({ each: true })
  dates: string[];

  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() createdByUserId?: string;
  @IsOptional() @IsString() requesterUserId?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() crossStreetLocationDetail?: string;
  @IsOptional() @IsNumber() addressLatitude?: number;
  @IsOptional() @IsNumber() addressLongitude?: number;
  @IsOptional() @IsString() addressCity?: string;
  @IsOptional() @IsString() addressState?: string;
  @IsOptional() @IsString() addressZipCode?: string;
  @IsOptional() @IsString() addressCountry?: string;
  @IsOptional() @IsString() requesterName?: string;
  @IsOptional() @IsString() requesterPhone?: string;
  @IsOptional() @IsEmail() requesterEmail?: string;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleDocumentTypes?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) formTemplateIds?: string[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() plannedEquipment?: Array<{
    type: string;
    estimatedQuantity: number;
  }>;
  @IsOptional() @IsArray() plannedMaterials?: Array<{
    type: string;
    estimatedQuantity: number;
    materialIds?: string[];
    materialQuantities?: Record<string, number>;
  }>;
  @IsOptional() @IsArray() @IsString({ each: true }) workOrderTypes?: string[];
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  workOrderAuthorizedWorkerIds?: string[];

  @IsOptional()
  @IsString()
  shiftTemplateId?: string;

  @IsOptional()
  @IsString()
  defaultRoleStartTime?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkShiftRoleDto)
  roles: BulkShiftRoleDto[];

                                                                                    
  @IsOptional()
  @IsBoolean()
  skipDuplicates?: boolean = false;
}
