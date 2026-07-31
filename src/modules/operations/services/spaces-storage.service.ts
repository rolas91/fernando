import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID } from 'crypto';
import sharp from 'sharp';
import {
  ALLOWED_MIME_BY_UPLOAD_SCOPE,
  normalizeUploadMimeForScope,
  parseSpacesUploadMaxBytes,
} from '../constants/spaces-upload.constants';

type UploadFileCandidate = {
  originalname?: string;
  mimetype?: string;
  buffer?: Buffer;
  size?: number;
};

type SignedHeaderMap = Record<string, string>;

@Injectable()
export class SpacesStorageService {
  private readonly logger = new Logger(SpacesStorageService.name);

  constructor(private readonly configService: ConfigService) {}

  async uploadWorkOrderFiles(
    files: UploadFileCandidate[],
    workOrderId?: string,
  ) {
    return this.uploadFilesForScope('work-orders', files, workOrderId);
  }

  async uploadGeneratedWorkOrderPdf(
    file: UploadFileCandidate,
    workOrderId: string,
    submissionId: string,
  ) {
    return this.uploadFilesForScope(
      'work-orders',
      [file],
      `${workOrderId || 'draft'}/generated/${submissionId || 'submission'}`,
      true,
    ).then((uploads) => uploads[0] || null);
  }

  async uploadCertificationDocuments(
    files: UploadFileCandidate[],
    certificationId?: string,
  ) {
    return this.uploadFilesForScope(
      'certifications',
      files,
      certificationId,
    );
  }

  async uploadWorkerFiles(files: UploadFileCandidate[], workerId?: string) {
    return this.uploadFilesForScope('workers', files, workerId);
  }

  async uploadShiftChatFiles(files: UploadFileCandidate[], shiftId?: string) {
    return this.uploadFilesForScope('shift-chat', files, shiftId);
  }

  async uploadLogo(
    file: UploadFileCandidate,
  ) {
    const processed = await this.processLogoImage(file);
    const results = await this.uploadFilesForScope('logo', [processed], 'company');
    return results[0] || null;
  }

  /**
   * Processes a logo upload: converts JPG/raster images to PNG and removes
   * white/near-white backgrounds so the logo composites cleanly on any background.
   * PNG images with transparency are returned as-is.
   * SVG files are returned unchanged (vector format).
   */
  private async processLogoImage(
    file: UploadFileCandidate,
  ): Promise<UploadFileCandidate> {
    if (!file.buffer?.length) return file;
    const originalName = file.originalname || 'logo';
    const lowerName = originalName.toLowerCase();
    const isSvg = lowerName.endsWith('.svg');
    if (isSvg) return file;

    try {
      const trimmedName = originalName.replace(/\.(jpe?g|png|webp)$/i, '');
      const newName = `${trimmedName}.png`;

      // Step 1: Get RGBA raw bytes
      const { data: rgbaRaw, info } = await sharp(file.buffer, { failOn: 'none' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Step 2: Create an alpha mask where "white-ish" pixels become transparent
      // (we copy the rgbaRaw so we don't mutate sharp's internal buffer)
      const channels = info.channels;
      const width = info.width;
      const height = info.height;
      const pixelCount = width * height;
      const safeRgba = Buffer.from(rgbaRaw);
      const maskData = Buffer.alloc(pixelCount); // 1 byte per pixel
      const threshold = 245;
      for (let i = 0; i < pixelCount; i++) {
        const idx = i * channels;
        const r = safeRgba[idx];
        const g = safeRgba[idx + 1];
        const b = safeRgba[idx + 2];
        maskData[i] = r >= threshold && g >= threshold && b >= threshold ? 0 : 255;
      }

      // Step 3: Apply mask to alpha channel
      // If image was originally 3-channel (RGB), channels===3 means maskData[i] goes to alpha
      // If image was already 4-channel (RGBA), we need to update the existing alpha
      if (channels === 3) {
        for (let i = 0; i < pixelCount; i++) {
          safeRgba[i * 4 + 3] = maskData[i];
        }
        const processedBuffer = await sharp(safeRgba, {
          raw: { width, height, channels: 4 },
        }).png().toBuffer();

        this.logger.log(`Logo processed: ${originalName} → ${newName} (${processedBuffer.length} bytes)`);
        return {
          ...file,
          buffer: processedBuffer,
          originalname: newName,
          mimetype: 'image/png',
          size: processedBuffer.length,
        };
      }

      // For 4-channel (RGBA) images, modify alpha in place
      for (let i = 0; i < pixelCount; i++) {
        const alphaIdx = i * 4 + 3;
        // Keep the original alpha if it was already transparent, otherwise use mask
        if (safeRgba[alphaIdx] > 0) {
          safeRgba[alphaIdx] = Math.min(safeRgba[alphaIdx], maskData[i]);
        }
      }
      const processedBuffer = await sharp(safeRgba, {
        raw: { width, height, channels: 4 },
      }).png().toBuffer();

      this.logger.log(`Logo processed: ${originalName} → ${newName} (${processedBuffer.length} bytes)`);
      return {
        ...file,
        buffer: processedBuffer,
        originalname: newName,
        mimetype: 'image/png',
        size: processedBuffer.length,
      };
    } catch (error) {
      this.logger.warn(
        `Logo processing failed for ${originalName}, uploading as-is: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return file;
    }
  }

  private async uploadFilesForScope(
    scopePrefix: 'workers' | 'work-orders' | 'certifications' | 'shift-chat' | 'logo',
    files: UploadFileCandidate[],
    scopeId?: string,
    preserveFileName = false,
  ) {
    this.assertConfigured();
    if (!Array.isArray(files) || files.length === 0) {
      return [];
    }

    const allowedMime = ALLOWED_MIME_BY_UPLOAD_SCOPE[scopePrefix];
    if (!allowedMime) {
      throw new InternalServerErrorException(
        `Unknown upload scope: ${scopePrefix}`,
      );
    }
    const maxBytes = parseSpacesUploadMaxBytes(
      this.configService.get<string>('SPACES_UPLOAD_MAX_BYTES'),
    );

    const uploads: Array<{
      url: string;
      key: string;
      name: string;
      size: number;
      contentType: string;
    }> = [];
    for (const file of files) {
      this.assertUploadCandidate(
        file,
        scopePrefix,
        maxBytes,
      );
      const body = file.buffer!;
      const key = this.buildObjectKey(
        scopePrefix,
        file.originalname || 'upload.bin',
        scopeId,
        preserveFileName,
      );
      await this.putObject(
        key,
        body,
        file.mimetype || 'application/octet-stream',
      );
      uploads.push({
        url: this.buildPublicUrl(key),
        key,
        name: file.originalname || this.getFileNameFromKey(key),
        size: file.size || body.length,
        contentType: file.mimetype || 'application/octet-stream',
      });
    }

    return uploads;
  }

  async deletePublicFileByUrl(url: string) {
    this.assertConfigured();
    const key = this.extractObjectKey(url);
    await this.deleteObject(key);
    return { success: true };
  }

  async deleteManyPublicFiles(urls: string[]) {
    if (!this.isConfigured()) return;
    const safeUrls = Array.isArray(urls) ? urls.filter(Boolean) : [];
    for (const url of safeUrls) {
      try {
        await this.deletePublicFileByUrl(url);
      } catch (error) {
        this.logger.warn(
          `Could not delete Spaces object for url=${url}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  isConfigured() {
    return Boolean(
      this.configService.get<string>('SPACES_ENDPOINT') &&
        this.configService.get<string>('SPACES_BUCKET') &&
        this.configService.get<string>('SPACES_ACCESS_KEY_ID') &&
        this.configService.get<string>('SPACES_SECRET_ACCESS_KEY'),
    );
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'DigitalOcean Spaces is not configured in this environment.',
      );
    }
  }

  private assertUploadCandidate(
    file: UploadFileCandidate,
    scope: 'workers' | 'work-orders' | 'certifications' | 'shift-chat' | 'logo',
    maxBytes: number,
  ) {
    const buffer = file.buffer;
    if (!buffer?.length) {
      throw new BadRequestException('Uno o más archivos están vacíos.');
    }
    const reported = file.size ?? buffer.length;
    if (reported > maxBytes || buffer.length > maxBytes) {
      throw new BadRequestException(
        'El archivo supera el tamaño máximo permitido.',
      );
    }
    const rawForMessage =
      (file.mimetype || '').trim().toLowerCase() || 'vacío';
    const normalized = normalizeUploadMimeForScope(
      file.mimetype,
      file.originalname,
      scope,
    );
    if (!normalized) {
      throw new BadRequestException(
        `Tipo de archivo no permitido (${rawForMessage}).`,
      );
    }
    file.mimetype = normalized;
  }

  private async putObject(key: string, body: Buffer, contentType: string) {
    const payloadHash = this.sha256Hex(body);
    const headers = this.buildSignedHeaders('PUT', key, payloadHash, {
      'content-type': contentType,
      'x-amz-acl': 'public-read',
    });

    const response = await fetch(this.buildStorageUrl(key), {
      method: 'PUT',
      headers,
      body: new Uint8Array(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(
        `Spaces upload failed for key=${key}: ${response.status} ${detail}`,
      );
      throw new InternalServerErrorException('Could not upload file to DigitalOcean Spaces.');
    }
  }

  private async deleteObject(key: string) {
    const payloadHash = this.sha256Hex('');
    const headers = this.buildSignedHeaders('DELETE', key, payloadHash);

    const response = await fetch(this.buildStorageUrl(key), {
      method: 'DELETE',
      headers,
    });

    if (!response.ok && response.status !== 404) {
      const detail = await response.text();
      this.logger.error(
        `Spaces delete failed for key=${key}: ${response.status} ${detail}`,
      );
      throw new InternalServerErrorException('Could not delete file from DigitalOcean Spaces.');
    }
  }

  private buildSignedHeaders(
    method: 'PUT' | 'DELETE',
    key: string,
    payloadHash: string,
    extraHeaders: SignedHeaderMap = {},
  ) {
    const now = new Date();
    const amzDate = this.toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const host = this.getBucketHost();
    const region = this.getRegion();
    const accessKey = this.configService.get<string>('SPACES_ACCESS_KEY_ID')!;
    const secretKey = this.configService.get<string>('SPACES_SECRET_ACCESS_KEY')!;

    const headers: SignedHeaderMap = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...extraHeaders,
    };

    const sortedHeaderKeys = Object.keys(headers).sort();
    const canonicalHeaders = sortedHeaderKeys
      .map((headerKey) => `${headerKey}:${headers[headerKey].trim()}\n`)
      .join('');
    const signedHeaders = sortedHeaderKeys.join(';');
    const canonicalRequest = [
      method,
      `/${this.encodeObjectKey(key)}`,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256Hex(canonicalRequest),
    ].join('\n');
    const signingKey = this.getSignatureKey(secretKey, dateStamp, region, 's3');
    const signature = createHmac('sha256', signingKey)
      .update(stringToSign)
      .digest('hex');

    return {
      ...headers,
      Authorization: [
        `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`,
      ].join(', '),
    };
  }

  private buildObjectKey(
    scopePrefix: string,
    originalName: string,
    scopeId?: string,
    preserveFileName = false,
  ) {
    const basePrefix = this.normalizePrefix(
      this.configService.get<string>('SPACES_PREFIX') || 'work-orders',
    );
    const prefix = this.normalizePrefix(`${basePrefix}/${scopePrefix}`);
    const safeName = this.sanitizeFileName(originalName);
    const date = new Date().toISOString().slice(0, 10);
    const scope = (scopeId?.trim() || 'draft')
      .split(/[\\/]+/)
      .map((segment) => this.sanitizePathSegment(segment))
      .filter(Boolean)
      .join('/');
    const storedName = preserveFileName
      ? safeName
      : `${randomUUID()}-${safeName}`;
    return `${prefix}/${scope}/${date}/${storedName}`;
  }

  private buildStorageUrl(key: string) {
    return `https://${this.getBucketHost()}/${this.encodeObjectKey(key)}`;
  }

  private buildPublicUrl(key: string) {
    const base =
      this.configService.get<string>('SPACES_PUBLIC_BASE_URL') ||
      `https://${this.getBucketHost()}`;
    return `${base.replace(/\/+$/, '')}/${this.encodeObjectKey(key)}`;
  }

  private extractObjectKey(url: string) {
    const parsed = new URL(url);
    const publicBase = (
      this.configService.get<string>('SPACES_PUBLIC_BASE_URL') ||
      `https://${this.getBucketHost()}`
    ).replace(/\/+$/, '');

    if (url.startsWith(`${publicBase}/`)) {
      return decodeURIComponent(url.slice(publicBase.length + 1));
    }

    const endpointHost = this.getEndpointHost();
    const bucket = this.configService.get<string>('SPACES_BUCKET')!;
    if (parsed.host === `${bucket}.${endpointHost}`) {
      return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    }

    if (parsed.host === endpointHost) {
      const [first, ...rest] = parsed.pathname.replace(/^\/+/, '').split('/');
      if (first === bucket && rest.length > 0) {
        return decodeURIComponent(rest.join('/'));
      }
    }

    throw new InternalServerErrorException('Could not resolve the Spaces object key from the provided URL.');
  }

  private getBucketHost() {
    const bucket = this.configService.get<string>('SPACES_BUCKET')!;
    const endpointHost = this.getEndpointHost();
    return endpointHost.startsWith(`${bucket}.`)
      ? endpointHost
      : `${bucket}.${endpointHost}`;
  }

  private getEndpointHost() {
    const raw = this.configService.get<string>('SPACES_ENDPOINT') || '';
    const normalized = raw.startsWith('http') ? raw : `https://${raw}`;
    return new URL(normalized).host;
  }

  private getRegion() {
    const configured = this.configService.get<string>('SPACES_REGION');
    if (configured?.trim()) return configured.trim();
    const endpointHost = this.getEndpointHost();
    return endpointHost.split('.')[0] || 'nyc3';
  }

  private getSignatureKey(
    key: string,
    dateStamp: string,
    regionName: string,
    serviceName: string,
  ) {
    const kDate = createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(regionName).digest();
    const kService = createHmac('sha256', kRegion).update(serviceName).digest();
    return createHmac('sha256', kService).update('aws4_request').digest();
  }

  private toAmzDate(date: Date) {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  private sha256Hex(value: Buffer | string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private encodeObjectKey(key: string) {
    return key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
  }

  private normalizePrefix(prefix: string) {
    return prefix.replace(/^\/+|\/+$/g, '') || 'work-orders';
  }

  private sanitizeFileName(name: string) {
    return name
      .normalize('NFKD')
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 180) || 'file';
  }

  private sanitizePathSegment(value: string) {
    return value
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || 'item';
  }

  private getFileNameFromKey(key: string) {
    return key.split('/').pop() || key;
  }
}
