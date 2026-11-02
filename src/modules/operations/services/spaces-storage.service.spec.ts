import { ConfigService } from '@nestjs/config';
import { SpacesStorageService } from './spaces-storage.service';

describe('SpacesStorageService object paths', () => {
  it('encodes special filename characters for S3 without encoding path separators', () => {
    const service = new SpacesStorageService(new ConfigService());
    const encode = (key: string) =>
      (service as any).encodeObjectKey(key) as string;

    expect(encode('work-orders/US 101 (Phase 4).pdf')).toBe(
      'work-orders/US%20101%20%28Phase%204%29.pdf',
    );
    expect(encode("files/José's !*~report.pdf")).toBe(
      'files/Jos%C3%A9%27s%20%21%2A~report.pdf',
    );
    expect(encode('files/100% complete.pdf')).toBe(
      'files/100%25%20complete.pdf',
    );
  });
});
