import { buildWorkOrderPdf } from './form-submissions.service';
import { PDFDocument } from 'pdf-lib';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

describe('Work order complete text', () => {
  const build = (data: Record<string, unknown>) =>
    buildWorkOrderPdf(
      { id: 'test', submittedAt: new Date('2026-10-16'), data } as never,
      { name: 'Work Order', category: 'Work Order' } as never,
      { workers: [], equipment: [], materials: [], workOrderTypes: [] },
    );

  it('prints the complete job name rather than a character-limited prefix', () => {
    const name = 'Bay Corridor Transmission and Distribution Project';
    const pdf = build({ job_name: name });
    expect(pdf.toString('latin1')).toContain(name);
    expect(pdf.toString('latin1')).not.toContain(
      'Bay Corridor Transmission an...',
    );
    if (process.env.PDF_REVIEW_OUTPUT) {
      mkdirSync(process.env.PDF_REVIEW_OUTPUT, { recursive: true });
      writeFileSync(
        resolve(process.env.PDF_REVIEW_OUTPUT, 'work-order-full-name.pdf'),
        pdf,
      );
    }
  });

  it('preserves very long values on paginated detail pages without ellipses', async () => {
    const text = Array.from({ length: 900 }, (_, i) => `segment-${i}`).join(
      ' ',
    );
    const pdf = build({ job_name: text });
    const raw = pdf.toString('latin1');
    expect(raw).toContain('FULL TEXT DETAILS');
    expect(
      (raw.match(/BT [^\n]+ Tj ET/g) || []).some((line) =>
        line.includes('...'),
      ),
    ).toBe(false);
    for (let i = 0; i < 900; i++)
      expect(raw.includes(`segment-${i}`)).toBe(true);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(2);
    if (process.env.PDF_REVIEW_OUTPUT) {
      writeFileSync(
        resolve(process.env.PDF_REVIEW_OUTPUT, 'work-order-full-details.pdf'),
        pdf,
      );
    }
  });
});
