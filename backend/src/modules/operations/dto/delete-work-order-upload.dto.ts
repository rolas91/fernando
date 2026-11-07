import { IsString } from 'class-validator';

export class DeleteWorkOrderUploadDto {
  @IsString()
  url: string;
}
