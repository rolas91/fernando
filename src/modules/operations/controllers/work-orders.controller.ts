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
import { BulkCreateShiftsDto } from '../dto/bulk-create-shifts.dto';
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

  @Get('shifts/overview')
  getShiftOverview() {
    return this.workOrdersService.findShiftOverview();
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
  @ApiQuery({ name: 'filter', required: false, enum: ['all', 'upcoming', 'this_week', 'completed'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findMobileAssignments(
    @Req() req: ReqWithOpsUser,
    @Query('search') search?: string,
    @Query('filter') filter?: 'all' | 'upcoming' | 'this_week' | 'completed',
    @Query('today') today?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.workOrdersService.findMobileAssignmentsForUser(req.user, {
      search,
      filter,
      today,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('mobile/assignments/:id')
  findMobileAssignment(
    @Req() req: ReqWithOpsUser,
    @Param('id') id: string,
  ) {
    return this.workOrdersService.findMobileAssignmentForUser(req.user, id);
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
  create(@Body() dto: CreateWorkOrderDto, @Req() req: ReqWithOpsUser) {
    return this.workOrdersService.create(dto, req.user);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateWorkOrderDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkOrderDto,
    @Req() req: ReqWithOpsUser,
  ) {
    return this.workOrdersService.update(id, dto, req.user);
  }

  @Post(':id/shifts/bulk-create')
  @ApiBody({ type: BulkCreateShiftsDto })
  bulkCreateShifts(
    @Param('id') id: string,
    @Body() dto: BulkCreateShiftsDto,
    @Req() req: ReqWithOpsUser,
  ) {
    return this.workOrdersService.bulkCreateShifts(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workOrdersService.remove(id);
  }
}
