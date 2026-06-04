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

export const ALLOWED_SHIFT_CHAT_UPLOAD_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/3gpp',
  'audio/3gpp2',
  'audio/amr',
  'video/mp4',
  'application/octet-stream',
]);

export const ALLOWED_MIME_BY_UPLOAD_SCOPE: Record<
  'workers' | 'work-orders' | 'certifications' | 'shift-chat',
  ReadonlySet<string>
> = {
  certifications: ALLOWED_CERTIFICATION_UPLOAD_MIME,
  workers: ALLOWED_WORKER_UPLOAD_MIME,
  'work-orders': ALLOWED_WORK_ORDER_UPLOAD_MIME,
  'shift-chat': ALLOWED_SHIFT_CHAT_UPLOAD_MIME,
};

export type SpacesUploadScope = keyof typeof ALLOWED_MIME_BY_UPLOAD_SCOPE;

/**
 * Infer canonical MIME from filename extension for Spaces uploads.
 * Scoped so workers do not inherit cert-only types (e.g. webp).
 */
function inferMimeFromOriginalName(
  originalname: string | undefined | null,
  scope: SpacesUploadScope,
): string | null {
  const base = (originalname || '').trim().toLowerCase();
  const dot = base.lastIndexOf('.');
  if (dot < 0 || dot >= base.length - 1) return null;
  const ext = base.slice(dot + 1);

  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return scope !== 'workers' ? 'image/webp' : null;
    case 'doc':
      return scope === 'work-orders' ? 'application/msword' : null;
    case 'docx':
      return scope === 'work-orders'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : null;
    case 'xls':
      return scope === 'work-orders' ? 'application/vnd.ms-excel' : null;
    case 'xlsx':
      return scope === 'work-orders'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : null;
    case 'mp3':
      return scope === 'shift-chat' ? 'audio/mpeg' : null;
    case 'm4a':
      return scope === 'shift-chat' ? 'audio/mp4' : null;
    case 'aac':
      return scope === 'shift-chat' ? 'audio/aac' : null;
    case 'wav':
      return scope === 'shift-chat' ? 'audio/wav' : null;
    case 'ogg':
      return scope === 'shift-chat' ? 'audio/ogg' : null;
    case 'webm':
      return scope === 'shift-chat' ? 'audio/webm' : null;
    case '3gp':
      return scope === 'shift-chat' ? 'audio/3gpp' : null;
    case 'amr':
      return scope === 'shift-chat' ? 'audio/amr' : null;
    case 'mp4':
      return scope === 'shift-chat' ? 'video/mp4' : null;
    default:
      return null;
  }
}

/**
 * Normalize client-reported MIME (often `application/octet-stream` or empty for PDFs)
 * using filename when the reported type is missing or not in the scope allow-list.
 */
export function normalizeUploadMimeForScope(
  reportedMime: string | undefined | null,
  originalname: string | undefined | null,
  scope: SpacesUploadScope,
): string | null {
  const allowed = ALLOWED_MIME_BY_UPLOAD_SCOPE[scope];
  const raw = (reportedMime || '').trim().toLowerCase();
  const reported = raw || 'application/octet-stream';

  if (allowed.has(reported)) return reported;

  const inferred = inferMimeFromOriginalName(originalname, scope);
  return inferred && allowed.has(inferred) ? inferred : null;
}

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
