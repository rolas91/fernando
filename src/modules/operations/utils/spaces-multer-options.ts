import { BadRequestException } from '@nestjs/common';
import * as multer from 'multer';
import {
  ALLOWED_MIME_BY_UPLOAD_SCOPE,
  parseSpacesUploadMaxBytes,
} from '../constants/spaces-upload.constants';

export type SpacesUploadScope = keyof typeof ALLOWED_MIME_BY_UPLOAD_SCOPE;

type MulterLikeFile = {
  mimetype?: string;
  originalname?: string;
};

export function createSpacesUploadMulterOptions(
  scope: SpacesUploadScope,
  maxBytes = parseSpacesUploadMaxBytes(
    process.env.SPACES_UPLOAD_MAX_BYTES,
  ),
) {
  const allowedMimeTypes = ALLOWED_MIME_BY_UPLOAD_SCOPE[scope];
  return {
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes },
    fileFilter: (
      _req: unknown,
      file: MulterLikeFile,
      cb: (error: Error | null, acceptFile: boolean) => void,
    ) => {
      const mime = (file.mimetype || '').trim().toLowerCase();
      if (!allowedMimeTypes.has(mime)) {
        cb(
          new BadRequestException(
            `Tipo de archivo no permitido (${mime}).`,
          ),
          false,
        );
        return;
      }
      cb(null, true);
    },
  };
}
