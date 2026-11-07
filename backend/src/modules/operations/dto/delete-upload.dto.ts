import { IsString } from 'class-validator';

export class DeleteUploadDto {
  @IsString()
  url: string;
}
