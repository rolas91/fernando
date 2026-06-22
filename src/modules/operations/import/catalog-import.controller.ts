import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { OperationsAuthGuard } from '../operations-auth.guard';
import { CatalogImportService } from './catalog-import.service';
import { CATALOG_SCOPES, type CatalogScope, type ImportMode } from './parsers/parser.types';
import * as multer from 'multer';

const ALLOWED_IMPORT_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

function isCatalogScope(value: string): value is CatalogScope {
  return (CATALOG_SCOPES as readonly string[]).includes(value);
}

function normalizeMime(
  file: { mimetype?: string; originalname?: string },
): string {
  const raw = (file.mimetype || '').toLowerCase();
  if (ALLOWED_IMPORT_MIME.has(raw)) return raw;
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (name.endsWith('.xls')) return 'application/vnd.ms-excel';
  return raw || 'application/octet-stream';
}

@Controller('catalog-import')
@UseGuards(OperationsAuthGuard)
export class CatalogImportController {
  constructor(private readonly service: CatalogImportService) {}

  @Get('scopes')
  listScopes() {
    return { scopes: CATALOG_SCOPES };
  }

  @Get(':scope/template')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async downloadTemplate(
    @Param('scope') scopeParam: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!isCatalogScope(scopeParam)) {
      throw new BadRequestException(`Alcance inválido: ${scopeParam}`);
    }
    const buffer = await this.service.generateTemplate(scopeParam);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${scopeParam}-template.xlsx"`,
    );
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }

  @Post(':scope/preview')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const mime = normalizeMime(file);
        if (!ALLOWED_IMPORT_MIME.has(mime)) {
          cb(new BadRequestException('Tipo de archivo no permitido (solo .xlsx)'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async preview(
    @Param('scope') scopeParam: string,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string },
  ) {
    if (!isCatalogScope(scopeParam)) {
      throw new BadRequestException(`Alcance inválido: ${scopeParam}`);
    }
    if (!file?.buffer) {
      throw new BadRequestException('Falta el archivo "file"');
    }
    return this.service.preview(scopeParam, file.buffer, file.originalname);
  }

  @Post(':scope/apply')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const mime = normalizeMime(file);
        if (!ALLOWED_IMPORT_MIME.has(mime)) {
          cb(new BadRequestException('Tipo de archivo no permitido (solo .xlsx)'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async apply(
    @Param('scope') scopeParam: string,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string },
    @Body() body: { mode?: ImportMode; dryRun?: boolean | string },
  ) {
    if (!isCatalogScope(scopeParam)) {
      throw new BadRequestException(`Alcance inválido: ${scopeParam}`);
    }
    if (!file?.buffer) {
      throw new BadRequestException('Falta el archivo "file"');
    }
    const mode: ImportMode = body?.mode === 'create' ? 'create' : 'upsert';
    const dryRun = body?.dryRun === true || body?.dryRun === 'true';
    const result = await this.service.apply(scopeParam, file.buffer, {
      mode,
      dryRun,
      filename: file.originalname,
    });
    return result;
  }

  @Post(':scope/apply-async')
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const mime = normalizeMime(file);
        if (!ALLOWED_IMPORT_MIME.has(mime)) {
          cb(new BadRequestException('Tipo de archivo no permitido (solo .xlsx)'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async applyAsync(
    @Param('scope') scopeParam: string,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string },
    @Body() body: { mode?: ImportMode },
  ) {
    if (!isCatalogScope(scopeParam)) {
      throw new BadRequestException(`Alcance inválido: ${scopeParam}`);
    }
    if (!file?.buffer) {
      throw new BadRequestException('Falta el archivo "file"');
    }
    const mode: ImportMode = body?.mode === 'create' ? 'create' : 'upsert';
    const job = await this.service.applyAsync(scopeParam, file.buffer, {
      mode,
      filename: file.originalname,
    });
    return job;
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string, @Query('wait') wait?: string) {
    const job = this.service.getJob(id);
    if (!job) {
      throw new BadRequestException(`Trabajo ${id} no encontrado`);
    }
    void wait;
    return job;
  }
}
