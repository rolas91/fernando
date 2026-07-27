import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateWorkerDto } from '../dto/create-worker.dto';
import { DeleteUploadDto } from '../dto/delete-upload.dto';
import { UpdateWorkerDto } from '../dto/update-worker.dto';
import { SpacesStorageService } from '../services/spaces-storage.service';
import { WorkersService } from '../services/workers.service';
import { createSpacesUploadMulterOptions } from '../utils/spaces-multer-options';
import type { Request } from 'express';
import type { UserAccessContext } from '../../access/ports/access.port';
import { RegisterFcmTokenDto } from '../dto/register-fcm-token.dto';

type ReqWithOpsUser = Request & { user?: UserAccessContext };

@ApiTags('operations')
@Controller('workers')
@UseGuards(OperationsAuthGuard)
export class WorkersController {
  constructor(
    private readonly workersService: WorkersService,
    private readonly spacesStorage: SpacesStorageService,
  ) {}

  @Get()
  findAll() {
    return this.workersService.findAll();
  }

  @Post('uploads')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        workerId: { type: 'string', nullable: true },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
      required: ['files'],
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, createSpacesUploadMulterOptions('workers')),
  )
  uploadFiles(
    @UploadedFiles()
    files: Array<{
      originalname?: string;
      mimetype?: string;
      buffer?: Buffer;
      size?: number;
    }>,
    @Body('workerId') workerId?: string,
  ) {
    return this.spacesStorage.uploadWorkerFiles(files || [], workerId);
  }

  @Delete('uploads')
  @ApiBody({ type: DeleteUploadDto })
  deleteUpload(@Body() dto: DeleteUploadDto) {
    return this.spacesStorage.deletePublicFileByUrl(dto.url);
  }

  @Post('me/fcm-token')
  @ApiBody({ type: RegisterFcmTokenDto })
  registerMyFcmToken(
    @Body() dto: RegisterFcmTokenDto,
    @Req() req: ReqWithOpsUser,
  ) {
    return this.workersService.registerFcmTokenForActor(dto.token, req.user);
  }

  @Get('me/profile')
  findMyProfile(@Req() req: ReqWithOpsUser) {
    return this.workersService.findMyProfile(req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workersService.findOne(id);
  }

  @Post()
  @ApiBody({ type: CreateWorkerDto })
  create(@Body() dto: CreateWorkerDto, @Req() req: ReqWithOpsUser) {
    return this.workersService.create(dto, req.user);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateWorkerDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkerDto,
    @Req() req: ReqWithOpsUser,
  ) {
    return this.workersService.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workersService.remove(id);
  }
}
