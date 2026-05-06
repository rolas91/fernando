import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import * as multer from 'multer';

@Catch(multer.MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: multer.MulterError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    let message =
      exception.message ||
      'Error while processing multipart upload.';
    switch (exception.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'El archivo supera el tamaño máximo permitido.';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Demasiados archivos en la solicitud.';
        break;
      case 'LIMIT_PART_COUNT':
        message = 'Demasiadas partes en la solicitud multipart.';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Campo de archivo inesperado en la solicitud.';
        break;
      case 'LIMIT_FIELD_KEY':
        message = 'Nombre de campo demasiado largo.';
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
