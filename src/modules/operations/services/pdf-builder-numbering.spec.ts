jest.mock('../../integrations/integrations.service', () => ({
  IntegrationsService: class IntegrationsService {},
}));

import {
  buildWorkOrderPdf,
  FormSubmissionsService,
} from './form-submissions.service';

describe('PDF Builder numbering preview', () => {
  it.each(['ASN-2026-001', '', undefined])(
    'prints the persisted WO number instead of a stale mapped value %p',
    (mappedNumber) => {
      const pdf = buildWorkOrderPdf(
        { id: 'submission-1', data: { custom_number: mappedNumber } } as any,
        null,
        { workOrder: { orderNumber: '000042' } } as any,
        { fields: { workOrderNumber: 'custom_number' } },
      ).toString();
      expect(pdf).toContain('000042');
      expect(pdf).not.toContain('ASN-2026-001');
    },
  );

  it('keeps the mapped number for forms without a linked WO number', () => {
    const pdf = buildWorkOrderPdf(
      { id: 'submission-1', data: { custom_number: 'MANUAL-42' } } as any,
      null,
      {} as any,
      { fields: { workOrderNumber: 'custom_number' } },
    ).toString();
    expect(pdf).toContain('MANUAL-42');
  });

  it.each([undefined, { workOrderNumber: 'custom_number' }])(
    'uses the saved numbering preview, including mapped fields %p',
    async (fields) => {
      const service = Object.create(
        FormSubmissionsService.prototype,
      ) as FormSubmissionsService;
      const previewNextWorkOrderNumber = jest
        .fn()
        .mockResolvedValue({ number: '00042' });
      Object.assign(service, { numbering: { previewNextWorkOrderNumber } });
      const pdf = await service.buildPdfBuilderPreview({ version: 2, fields });
      expect(pdf.toString()).toContain('00042');
      expect(pdf.toString()).not.toContain('ASN-2026-001');
      expect(previewNextWorkOrderNumber).toHaveBeenCalledTimes(1);
    },
  );
});
