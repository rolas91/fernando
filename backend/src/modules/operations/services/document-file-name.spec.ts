import { ConfigService } from '@nestjs/config';
import {
  safeDocumentFileName,
  uniqueDocumentFileName,
} from './document-file-name';
import { SpacesStorageService } from './spaces-storage.service';
import { generatedPdfFileName } from './form-submissions.service';

describe('document file names', () => {
  it('preserves spaces, accents and extension, placing uniqueness last', () => {
    const name = uniqueDocumentFileName('Certificación José Pérez.PDF');
    expect(name).toMatch(/^Certificación José Pérez-[a-f0-9]{12}\.PDF$/);
    expect(uniqueDocumentFileName('Certificación José Pérez.PDF')).not.toBe(
      name,
    );
  });

  it('removes paths and unsafe characters without losing long-name extensions', () => {
    expect(safeDocumentFileName('C:\\temp\\Report?.pdf')).toBe('Report-.pdf');
    expect(uniqueDocumentFileName(`${'a'.repeat(250)}.pdf`)).toMatch(
      /-[a-f0-9]{12}\.pdf$/,
    );
    expect(safeDocumentFileName('../..')).toBe('Document');
  });

  it('uses readable form titles instead of submission IDs', () => {
    expect(
      generatedPdfFileName(
        'internal-id',
        null,
        undefined,
        'Safety Inspection - 2026-10-27',
      ),
    ).toMatch(/^Safety Inspection - 2026-10-27-[a-f0-9]{12}\.pdf$/);
  });

  it('applies the same naming rule to every upload scope', () => {
    const service = new SpacesStorageService(new ConfigService());
    const build = (scope: string) =>
      (service as any).buildObjectKey(scope, 'My document.pdf', 'record');
    for (const scope of [
      'workers',
      'work-orders',
      'certifications',
      'shift-chat',
      'logo',
    ]) {
      expect(build(scope)).toMatch(
        /\/record\/\d{4}-\d{2}-\d{2}\/My document-[a-f0-9]{12}\.pdf$/,
      );
    }
    expect(
      (service as any).buildObjectKey(
        'work-orders',
        'Work Order-readable.pdf',
        'record',
        true,
      ),
    ).toMatch(/\/Work Order-readable\.pdf$/);
  });
});
