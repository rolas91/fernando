import { IsOptional, IsString } from 'class-validator';

export class CreateSkillDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  status: string;
}
