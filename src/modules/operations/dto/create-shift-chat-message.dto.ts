import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ShiftChatMessageKind } from '../../../entities/shift-chat-message.entity';

export class CreateShiftChatMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsIn(['text', 'image', 'audio'])
  kind?: ShiftChatMessageKind;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  mediaName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mediaContentType?: string;

  @IsOptional()
  mediaSize?: number;
}
