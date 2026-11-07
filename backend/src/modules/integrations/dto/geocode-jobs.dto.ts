import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class GeocodeJobLocationDto {
  @ApiProperty({ example: 'project_123' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'Downtown Corridor' })
  @IsString()
  name: string;

  @ApiProperty({ example: '1366 Palou Ave' })
  @IsString()
  location: string;

  @ApiProperty({ example: 'San Francisco' })
  @IsString()
  city: string;

  @ApiProperty({ example: 'confirmed' })
  @IsString()
  status: string;

  @ApiProperty({ example: 'City of San Francisco' })
  @IsString()
  clientName: string;
}

export class GeocodeJobsDto {
  @ApiProperty({
    type: [GeocodeJobLocationDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeocodeJobLocationDto)
  locations?: GeocodeJobLocationDto[];
}
