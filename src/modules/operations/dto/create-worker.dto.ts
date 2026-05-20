import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  IsDateOnlyPastOrPresent,
  IsDateOnlyTodayOrFuture,
  IsUsNanpPhone,
  normalizeUsPhoneDisplay,
} from '../validation/worker-field.validators';

export class WorkerCertificationAssignmentDto {
  @IsString()
  certificationId: string;

  @IsOptional()
  @IsString()
  expirationDate?: string;
}

export class CreateWorkerDto {
  @IsString()
  id: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  firstName: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastName: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  email: string;

  @Transform(({ value }) =>
    typeof value === 'string'
      ? normalizeUsPhoneDisplay(value.trim())
      : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @IsUsNanpPhone()
  phone: string;

  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return value
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9*-]/g, '')
      .slice(0, 24)
      .toUpperCase();
  })
  @ValidateIf((_, v) => typeof v === 'string' && v.trim() !== '')
  @IsString()
  @MinLength(3, {
    message: 'Licencia debe tener al menos 3 caracteres cuando se proporciona.',
  })
  @MaxLength(24)
  @Matches(/^[A-Z0-9*\-]+$/, {
    message:
      'Licencia debe contener solo letras mayúsculas, números, * y guión.',
  })
  driverLicense?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Fecha inválida (use YYYY-MM-DD).',
  })
  @IsDateOnlyTodayOrFuture()
  driverLicenseExpiration?: string | null;

  @IsOptional()
  @IsString()
  primaryAddress?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  latitude?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  longitude?: number | null;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  type: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  role: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  status: string;

  @IsOptional()
  @IsArray()
  certificationIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerCertificationAssignmentDto)
  certificationAssignments?: WorkerCertificationAssignmentDto[];

  @IsOptional()
  @IsArray()
  skillIds?: string[];

  @IsOptional()
  @IsArray()
  skills?: string[];

  @IsOptional()
  @IsArray()
  workerRoleIds?: string[];

  @IsOptional()
  @IsArray()
  workerRoles?: string[];

  @IsOptional()
  @IsArray()
  fileUploads?: string[];

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null && v !== '')
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Fecha de contratación inválida.',
  })
  @IsDateOnlyPastOrPresent()
  hireDate?: string;

  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return NaN;
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  })
  @IsNumber({}, { message: 'La tarifa horaria debe ser un número válido.' })
  @Min(0, { message: 'La tarifa horaria no puede ser negativa.' })
  @Max(750, { message: 'La tarifa horaria no debe superar 750.' })
  hourlyRate: number;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Also create a platform user with the same email (web app login).',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  createAppUser?: boolean;

  @ApiPropertyOptional({ minLength: 6 })
  @ValidateIf((o: CreateWorkerDto) => o.createAppUser === true)
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  appUserPassword?: string;

  @ApiPropertyOptional({ enum: ['admin', 'manager', 'scheduler', 'viewer'] })
  @ValidateIf((o: CreateWorkerDto) => o.createAppUser === true)
  @IsIn(['admin', 'manager', 'scheduler', 'viewer'])
  appUserRole?: 'admin' | 'manager' | 'scheduler' | 'viewer';
}
