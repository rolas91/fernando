import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import type { UserAccessContext } from '../../access/ports/access.port';
import { CreateShiftChatMessageDto } from '../dto/create-shift-chat-message.dto';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { ShiftChatGateway } from '../gateways/shift-chat.gateway';
import { ShiftChatService } from '../services/shift-chat.service';
import { SpacesStorageService } from '../services/spaces-storage.service';
import { createSpacesUploadMulterOptions } from '../utils/spaces-multer-options';

type ReqWithOpsUser = Request & { user?: UserAccessContext };

@ApiTags('operations')
@Controller('shift-chat')
@UseGuards(OperationsAuthGuard)
export class ShiftChatController {
  constructor(
    private readonly shiftChat: ShiftChatService,
    private readonly shiftChatGateway: ShiftChatGateway,
    private readonly spacesStorage: SpacesStorageService,
  ) {}

  @Get(':shiftId/messages')
  findMessages(@Req() req: ReqWithOpsUser, @Param('shiftId') shiftId: string) {
    return this.shiftChat.findMessages(req.user, shiftId);
  }

  @Post(':shiftId/messages')
  @ApiBody({ type: CreateShiftChatMessageDto })
  async createMessage(
    @Req() req: ReqWithOpsUser,
    @Param('shiftId') shiftId: string,
    @Body() dto: CreateShiftChatMessageDto,
  ) {
    const message = await this.shiftChat.createMessage(req.user, shiftId, dto);
    this.shiftChatGateway.emitShiftMessage(shiftId, message);
    return message;
  }

  @Post(':shiftId/uploads')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', 5, createSpacesUploadMulterOptions('shift-chat')),
  )
  async uploadFiles(
    @Req() req: ReqWithOpsUser,
    @Param('shiftId') shiftId: string,
    @UploadedFiles() files: Array<{ originalname?: string; mimetype?: string; buffer?: Buffer; size?: number }>,
  ) {
    await this.shiftChat.assertActorCanAccessShift(req.user, shiftId);
    return this.spacesStorage.uploadShiftChatFiles(files || [], shiftId);
  }
}
