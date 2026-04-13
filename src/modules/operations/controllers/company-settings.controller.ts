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
import { CreateCompanySettingsDto } from '../dto/create-company-settings.dto';
import { UpdateCompanySettingsDto } from '../dto/update-company-settings.dto';
import { CompanySettingsService } from '../services/company-settings.service';

@ApiTags('operations')
@Controller('company-settings')
@UseGuards(OperationsAuthGuard)
export class CompanySettingsController {
  constructor(private readonly service: CompanySettingsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCompanySettingsDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCompanySettingsDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
