import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { UpdateNotificationDto } from '../dto/update-notification.dto';
import { NotificationsService } from '../services/notifications.service';
import type { Request } from 'express';
import type { UserAccessContext } from '../../access/ports/access.port';

type ReqWithOpsUser = Request & { user?: UserAccessContext };

@ApiTags('operations')
@Controller('notifications')
@UseGuards(OperationsAuthGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('mobile/me')
  findMobileMine(@Req() req: ReqWithOpsUser) {
    return this.service.findMobileForActor(req.user);
  }

  @Patch('mobile/:id/read')
  markMobileRead(@Param('id') id: string, @Req() req: ReqWithOpsUser) {
    return this.service.markMobileRead(id, req.user);
  }

  @Delete('mobile/:id')
  removeMobile(@Param('id') id: string, @Req() req: ReqWithOpsUser) {
    return this.service.removeMobile(id, req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiBody({ type: CreateNotificationDto })
  create(@Body() dto: CreateNotificationDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateNotificationDto })
  update(@Param('id') id: string, @Body() dto: UpdateNotificationDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
