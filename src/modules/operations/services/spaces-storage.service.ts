import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID } from 'crypto';

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
    this.assertConfigured();
    if (!Array.isArray(files) || files.length === 0) {
      return [];
    }

    const uploads: Array<{
      url: string;
      key: string;
      name: string;
      size: number;
      contentType: string;
    }> = [];
    for (const file of files) {
      if (!file?.buffer?.length) continue;
      const key = this.buildObjectKey(file.originalname || 'upload.bin', workOrderId);
      await this.putObject(key, file.buffer, file.mimetype || 'application/octet-stream');
      uploads.push({
        url: this.buildPublicUrl(key),
        key,
        name: file.originalname || this.getFileNameFromKey(key),
        size: file.size || file.buffer.length,
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

  private buildObjectKey(originalName: string, workOrderId?: string) {
    const prefix = this.normalizePrefix(
      this.configService.get<string>('SPACES_PREFIX') || 'work-orders',
    );
    const safeName = this.sanitizeFileName(originalName);
    const date = new Date().toISOString().slice(0, 10);
    const scope = workOrderId?.trim() || 'draft';
    return `${prefix}/${scope}/${date}/${randomUUID()}-${safeName}`;
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

  private getFileNameFromKey(key: string) {
    return key.split('/').pop() || key;
  }
}
