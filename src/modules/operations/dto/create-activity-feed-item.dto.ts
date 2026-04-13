import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateActivityFeedItemDto {
  @IsString()
  id: string;

  @IsString()
  type: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsString()
  user?: string;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsArray()
  tags?: Record<string, unknown>[];
}
