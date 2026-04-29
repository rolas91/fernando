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
import { CreateCertificationDto } from '../dto/create-certification.dto';
import { DeleteUploadDto } from '../dto/delete-upload.dto';
import { UpdateCertificationDto } from '../dto/update-certification.dto';
import { CertificationsService } from '../services/certifications.service';
import { SpacesStorageService } from '../services/spaces-storage.service';

@ApiTags('operations')
@Controller('certifications')
@UseGuards(OperationsAuthGuard)
export class CertificationsController {
  constructor(
    private readonly service: CertificationsService,
    private readonly spacesStorage: SpacesStorageService,
  ) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post('uploads')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        certificationId: { type: 'string', nullable: true },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
      required: ['files'],
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 1, {
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
    @Body('certificationId') certificationId?: string,
  ) {
    return this.spacesStorage.uploadCertificationDocuments(
      files || [],
      certificationId,
    );
  }

  @Delete('uploads')
  @ApiBody({ type: DeleteUploadDto })
  deleteUpload(@Body() dto: DeleteUploadDto) {
    return this.spacesStorage.deletePublicFileByUrl(dto.url);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiBody({ type: CreateCertificationDto })
  create(@Body() dto: CreateCertificationDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateCertificationDto })
  update(@Param('id') id: string, @Body() dto: UpdateCertificationDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
