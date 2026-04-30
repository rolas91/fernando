import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
const multer = require('multer');
import { FilesInterceptor } from '@nestjs/platform-express';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateWorkerDto } from '../dto/create-worker.dto';
import { DeleteUploadDto } from '../dto/delete-upload.dto';
import { UpdateWorkerDto } from '../dto/update-worker.dto';
import { SpacesStorageService } from '../services/spaces-storage.service';
import { WorkersService } from '../services/workers.service';

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
    FilesInterceptor('files', 10, {
      storage: multer.memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workersService.findOne(id);
  }

  @Post()
  @ApiBody({ type: CreateWorkerDto })
  create(@Body() dto: CreateWorkerDto) {
    return this.workersService.create(dto);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateWorkerDto })
  update(@Param('id') id: string, @Body() dto: UpdateWorkerDto) {
    return this.workersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workersService.remove(id);
  }
}
