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
import { CreateCertificationDto } from '../dto/create-certification.dto';
import { UpdateCertificationDto } from '../dto/update-certification.dto';
import { CertificationsService } from '../services/certifications.service';

@ApiTags('operations')
@Controller('certifications')
@UseGuards(OperationsAuthGuard)
export class CertificationsController {
  constructor(private readonly service: CertificationsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
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
