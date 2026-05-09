import { BadRequestException } from '@nestjs/common';
import * as multer from 'multer';
import {
  normalizeUploadMimeForScope,
  parseSpacesUploadMaxBytes,
  type SpacesUploadScope,
} from '../constants/spaces-upload.constants';

export type { SpacesUploadScope };

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
  return {
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes },
    fileFilter: (
      _req: unknown,
      file: MulterLikeFile,
      cb: (error: Error | null, acceptFile: boolean) => void,
    ) => {
      const raw = (file.mimetype || '').trim().toLowerCase();
      const normalized = normalizeUploadMimeForScope(
        file.mimetype,
        file.originalname,
        scope,
      );
      if (!normalized) {
        cb(
          new BadRequestException(
            `Tipo de archivo no permitido (${raw || 'vacío'}).`,
          ),
          false,
        );
        return;
      }
      file.mimetype = normalized;
      cb(null, true);
    },
  };
}
