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
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { UserAccessContext } from '../../access/ports/access.port';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateFormSubmissionDto } from '../dto/create-form-submission.dto';
import { UpdateFormSubmissionDto } from '../dto/update-form-submission.dto';
import { FormSubmissionsService } from '../services/form-submissions.service';

type ReqWithOpsUser = Request & { user?: UserAccessContext };

@ApiTags('operations')
@Controller('form-submissions')
@UseGuards(OperationsAuthGuard)
export class FormSubmissionsController {
  constructor(private readonly service: FormSubmissionsService) {}

  @Get()
  findAll(
    @Query('projectId') projectId?: string,
    @Query('workOrderId') workOrderId?: string,
    @Query('templateId') templateId?: string,
    @Query('shiftId') shiftId?: string,
    @Req() req?: ReqWithOpsUser,
  ) {
    if (projectId || workOrderId || templateId || shiftId) {
      return this.service.findAll(
        { projectId, workOrderId, templateId, shiftId },
        req?.user,
      );
    }
    return this.service.findAll(undefined, req?.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiBody({ type: CreateFormSubmissionDto })
  create(@Body() dto: CreateFormSubmissionDto, @Req() req: ReqWithOpsUser) {
    return this.service.create(dto, req.user);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateFormSubmissionDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFormSubmissionDto,
    @Req() req: ReqWithOpsUser,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
