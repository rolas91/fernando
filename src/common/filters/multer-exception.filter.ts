import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import * as multer from 'multer';
import { SystemErrorsService } from '../../modules/system-errors/system-errors.service';

@Catch(multer.MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  constructor(private readonly errors: SystemErrorsService) {}
  catch(exception: multer.MulterError, host: ArgumentsHost) {
    void this.errors.record({
      message: exception.message,
      stack: exception.stack,
      context: 'File upload',
      level: 'warn',
      statusCode: 400,
    });
    const res = host.switchToHttp().getResponse<Response>();

    let message =
      exception.message || 'Error while processing multipart upload.';
    switch (exception.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'The file exceeds the maximum allowed size.';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files in the request.';
        break;
      case 'LIMIT_PART_COUNT':
        message = 'Demasiadas partes en la solicitud multipart.';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field in the request.';
        break;
      case 'LIMIT_FIELD_KEY':
        message = 'The field name is too long.';
        break;
      case 'LIMIT_FIELD_VALUE':
        message = 'Valor de campo demasiado largo.';
        break;
      case 'LIMIT_FIELD_COUNT':
        message = 'Demasiados campos en el formulario.';
        break;
      default:
        break;
    }

    res.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message,
    });
  }
}
