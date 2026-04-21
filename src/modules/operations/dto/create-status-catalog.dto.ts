import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateStatusCatalogDto {
  @IsString()
  id: string;

  @IsString()
  @IsIn([
    'work_order',
    'timesheet',
    'project',
    'equipment',
    'availability_request',
    'incident',
    'form_submission',
  ])
  scope:
    | 'work_order'
    | 'timesheet'
    | 'project'
    | 'equipment'
    | 'availability_request'
    | 'incident'
    | 'form_submission';

  @IsString()
  value: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  blocksEditing?: boolean;

  @IsOptional()
  @IsBoolean()
  triggersNotification?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
