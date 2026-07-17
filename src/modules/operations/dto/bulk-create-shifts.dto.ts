import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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

  @IsOptional()
  @IsArray()
  assignedEquipment?: string[];

  @IsOptional()
  @IsArray()
  assignedMaterials?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipmentTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  materialTypes?: string[];
}

export class BulkCreateShiftsDto {
  /** Base shift template. The backend will clone this for each date. */
  @IsString()
  baseDate: string;

  /** Dates (YYYY-MM-DD) where the shift should be created. */
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
  @IsOptional() @IsArray() @IsString({ each: true }) visibleDocumentTypes?: string[];
  @IsOptional() @IsString() notes?: string;

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

  /** When true, dates that already have a shift with the same startTime are skipped. */
  @IsOptional()
  @IsBoolean()
  skipDuplicates?: boolean = true;
}
