/** Default per-file cap before upload to Spaces (matches Multer). */
export const SPACES_UPLOAD_DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

/**
 * DigitalOcean Spaces: single PUT supports up to 5 GiB per object.
 * See https://docs.digitalocean.com/products/spaces/details/limits/
 */
export const SPACES_SINGLE_PUT_MAX_BYTES = 5 * 1024 * 1024 * 1024;

/** Certification uploads: PDF + raster images. */
export const ALLOWED_CERTIFICATION_UPLOAD_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** Worker files: sólo PDF e imágenes JPEG/PNG según política UI. */
export const ALLOWED_WORKER_UPLOAD_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

/** Work orders: PDF, imágenes, Office habitual. */
export const ALLOWED_WORK_ORDER_UPLOAD_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const ALLOWED_MIME_BY_UPLOAD_SCOPE: Record<
  'workers' | 'work-orders' | 'certifications',
  ReadonlySet<string>
> = {
  certifications: ALLOWED_CERTIFICATION_UPLOAD_MIME,
  workers: ALLOWED_WORKER_UPLOAD_MIME,
  'work-orders': ALLOWED_WORK_ORDER_UPLOAD_MIME,
};

/**
 * Max bytes per uploaded file. Optional env `SPACES_UPLOAD_MAX_BYTES` (integer bytes),
 * capped at {@link SPACES_SINGLE_PUT_MAX_BYTES}.
 */
export function parseSpacesUploadMaxBytes(
  rawEnv: string | undefined | null,
): number {
  const t = rawEnv?.trim();
  if (!t) return SPACES_UPLOAD_DEFAULT_MAX_BYTES;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) {
    return SPACES_UPLOAD_DEFAULT_MAX_BYTES;
  }
  return Math.min(Math.floor(n), SPACES_SINGLE_PUT_MAX_BYTES);
}
