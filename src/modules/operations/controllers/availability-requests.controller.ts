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
import { ApiTags } from '@nestjs/swagger';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateAvailabilityRequestDto } from '../dto/create-availability-request.dto';
import { UpdateAvailabilityRequestDto } from '../dto/update-availability-request.dto';
import { AvailabilityRequestsService } from '../services/availability-requests.service';

@ApiTags('operations')
@Controller('availability-requests')
@UseGuards(OperationsAuthGuard)
export class AvailabilityRequestsController {
  constructor(private readonly service: AvailabilityRequestsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAvailabilityRequestDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAvailabilityRequestDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
