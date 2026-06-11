import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { createSpacesUploadMulterOptions } from '../utils/spaces-multer-options';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CreateCompanySettingsDto } from '../dto/create-company-settings.dto';
import { UpdateCompanySettingsDto } from '../dto/update-company-settings.dto';
import { CompanySettingsService } from '../services/company-settings.service';
import { SpacesStorageService } from '../services/spaces-storage.service';

@ApiTags('operations')
@Controller('company-settings')
@UseGuards(OperationsAuthGuard)
export class CompanySettingsController {
  constructor(
    private readonly service: CompanySettingsService,
    private readonly spaces: SpacesStorageService,
  ) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiBody({ type: CreateCompanySettingsDto })
  create(@Body() dto: CreateCompanySettingsDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateCompanySettingsDto })
  update(@Param('id') id: string, @Body() dto: UpdateCompanySettingsDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('logo-upload')
  @UseInterceptors(
    FileInterceptor('file', createSpacesUploadMulterOptions('logo')),
  )
  async uploadLogo(
    @UploadedFile() file: { originalname?: string; mimetype?: string; buffer?: Buffer; size?: number },
  ) {
    if (!file) throw new BadRequestException('No file provided.');
    const result = await this.spaces.uploadLogo(file);
    return { url: result?.url || '' };
  }
}
