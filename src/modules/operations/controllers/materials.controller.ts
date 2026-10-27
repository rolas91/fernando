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
import { CreateMaterialDto } from '../dto/create-material.dto';
import { UpdateMaterialDto } from '../dto/update-material.dto';
import { MaterialsService } from '../services/materials.service';
import { BulkDeleteMaterialsDto } from '../dto/bulk-delete-materials.dto';

@ApiTags('operations')
@Controller('materials')
@UseGuards(OperationsAuthGuard)
export class MaterialsController {
  constructor(private readonly service: MaterialsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id, true);
  }

  @Post()
  @ApiBody({ type: CreateMaterialDto })
  create(@Body() dto: CreateMaterialDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateMaterialDto })
  update(@Param('id') id: string, @Body() dto: UpdateMaterialDto) {
    return this.service.update(id, dto);
  }

  @Post('bulk-delete')
  @ApiBody({ type: BulkDeleteMaterialsDto })
  removeMany(@Body() dto: BulkDeleteMaterialsDto) {
    return this.service.removeMany(dto.ids);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
