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
import { FilesInterceptor } from '@nestjs/platform-express';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateWorkOrderDto } from '../dto/create-work-order.dto';
import { DeleteWorkOrderUploadDto } from '../dto/delete-work-order-upload.dto';
import { UpdateWorkOrderDto } from '../dto/update-work-order.dto';
import { WorkOrdersService } from '../services/work-orders.service';
import { SpacesStorageService } from '../services/spaces-storage.service';
import { createSpacesUploadMulterOptions } from '../utils/spaces-multer-options';

@ApiTags('operations')
@Controller('work-orders')
@UseGuards(OperationsAuthGuard)
export class WorkOrdersController {
  constructor(
    private readonly workOrdersService: WorkOrdersService,
    private readonly spacesStorage: SpacesStorageService,
  ) {}

  @Get()
  findAll() {
    return this.workOrdersService.findAll();
  }

  @Post('uploads')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        workOrderId: { type: 'string', nullable: true },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
      required: ['files'],
    },
  })
  @UseInterceptors(
    FilesInterceptor(
      'files',
      10,
      createSpacesUploadMulterOptions('work-orders'),
    ),
  )
  uploadFiles(
    @UploadedFiles() files: Array<{ originalname?: string; mimetype?: string; buffer?: Buffer; size?: number }>,
    @Body('workOrderId') workOrderId?: string,
  ) {
    return this.spacesStorage.uploadWorkOrderFiles(files || [], workOrderId);
  }

  @Delete('uploads')
  @ApiBody({ type: DeleteWorkOrderUploadDto })
  deleteUpload(@Body() dto: DeleteWorkOrderUploadDto) {
    return this.spacesStorage.deletePublicFileByUrl(dto.url);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workOrdersService.findOne(id);
  }

  @Post()
  @ApiBody({ type: CreateWorkOrderDto })
  create(@Body() dto: CreateWorkOrderDto) {
    return this.workOrdersService.create(dto);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateWorkOrderDto })
  update(@Param('id') id: string, @Body() dto: UpdateWorkOrderDto) {
    return this.workOrdersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workOrdersService.remove(id);
  }
}
