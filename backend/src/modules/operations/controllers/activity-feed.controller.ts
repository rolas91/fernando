import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateActivityFeedItemDto } from '../dto/create-activity-feed-item.dto';
import { UpdateActivityFeedItemDto } from '../dto/update-activity-feed-item.dto';
import { ActivityFeedService } from '../services/activity-feed.service';

@ApiTags('operations')
@Controller('activity-feed')
@UseGuards(OperationsAuthGuard)
export class ActivityFeedController {
  constructor(private readonly service: ActivityFeedService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiBody({ type: CreateActivityFeedItemDto })
  create(@Body() dto: CreateActivityFeedItemDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateActivityFeedItemDto })
  update(@Param('id') id: string, @Body() dto: UpdateActivityFeedItemDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
