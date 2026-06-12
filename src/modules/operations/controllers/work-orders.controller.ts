import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateWorkOrderDto } from '../dto/create-work-order.dto';
import { DeleteWorkOrderUploadDto } from '../dto/delete-work-order-upload.dto';
import { UpdateWorkOrderDto } from '../dto/update-work-order.dto';
import { WorkOrdersService } from '../services/work-orders.service';
import { SpacesStorageService } from '../services/spaces-storage.service';
import { createSpacesUploadMulterOptions } from '../utils/spaces-multer-options';
import type { Request } from 'express';
import type { UserAccessContext } from '../../access/ports/access.port';

type ReqWithOpsUser = Request & { user?: UserAccessContext };

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

  @Get('trash')
  findTrash() {
    return this.workOrdersService.findTrash();
  }

  @Patch('trash/:id/restore')
  restore(@Param('id') id: string) {
    return this.workOrdersService.restore(id);
  }

  @Get('mobile/assignments')
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Optional text to filter assignments.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['all', 'active', 'pending', 'at_risk', 'critical', 'completed'],
    description: 'Optional assignment status filter. Defaults to active.',
  })
  findMobileAssignments(
    @Req() req: ReqWithOpsUser,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.workOrdersService.findMobileAssignmentsForUser(req.user, {
      search,
      status,
    });
  }

  @Patch('mobile/assignments/:id/shifts/:shiftId/confirmation')
  updateMobileShiftConfirmation(
    @Req() req: ReqWithOpsUser,
    @Param('id') id: string,
    @Param('shiftId') shiftId: string,
    @Body('status') status: 'confirmed' | 'declined',
  ) {
    return this.workOrdersService.updateMobileShiftConfirmation(
      req.user,
      id,
      shiftId,
      status,
    );
  }

  @Patch('mobile/assignments/:id/confirmation')
  updateMobileAssignmentConfirmation(
    @Req() req: ReqWithOpsUser,
    @Param('id') id: string,
    @Body('status') status: 'confirmed' | 'declined',
  ) {
    return this.workOrdersService.updateMobileAssignmentConfirmation(
      req.user,
      id,
      status,
    );
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
  @ApiQuery({
    name: 'recycle',
    required: false,
    type: Boolean,
    description: 'Soft-delete the assignment so it can be restored from the Recycle Bin.',
  })
  remove(@Param('id') id: string, @Query('recycle') recycle?: string) {
    return this.workOrdersService.remove(id, recycle === 'true');
  }
}
